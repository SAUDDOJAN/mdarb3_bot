import { 
  getOpenVoiceSessions, 
  heartbeatVoiceSessionsAtomic, 
  closeVoiceSessionAtomic, 
  openVoiceSessionAtomic,
  processVoiceEntryTimeoutAtomic,
  processEmptyVoiceTimeoutAtomic,
  processLowVoiceTimeoutAtomic,
  getPendingVoiceChannelDeletions,
  markVoiceChannelDeletedAtomic,
  processManualChannelDeleteAtomic,
  executeTerminationFlow
} from '../db/engine.js';
import { query } from '../../../database/index.js';
import { updateEventsCard } from '../eventsCard.js';

export async function startupVoiceRecovery(client) {
  console.log("[B3.3 Voice Lifecycle] Starting Recovery...");
  const sessions = await getOpenVoiceSessions();
  for (const s of sessions) {
    let presenceStatus = 'INCONCLUSIVE';
    try {
      const channel = await client.channels.fetch(s.voice_channel_id);
      if (channel && channel.type === 2) {
        presenceStatus = channel.members.has(s.discord_id) ? 'CONFIRMED_PRESENT' : 'INCONCLUSIVE';
      }
    } catch (e) {
      if (e.code === 10003) {
        presenceStatus = 'CHANNEL_DEFINITIVELY_MISSING';
      }
    }

    if (presenceStatus === 'CHANNEL_DEFINITIVELY_MISSING') {
      await processManualChannelDeleteAtomic(s.group_id);
    } else if (presenceStatus === 'CONFIRMED_PRESENT') {
      // Close safe cutoff, open new session
      await closeVoiceSessionAtomic(s.group_id, s.discord_id, false);
      await openVoiceSessionAtomic(s.group_id, s.discord_id);
    }
    // INCONCLUSIVE -> Do nothing, do not close session based on negative cache
  }
}

export async function processVoiceHeartbeat(client) {
  const sessions = await getOpenVoiceSessions();
  const confirmedPresent = [];
  
  for (const s of sessions) {
    try {
      const channel = await client.channels.fetch(s.voice_channel_id).catch(() => null);
      if (channel && channel.type === 2 && channel.members.has(s.discord_id)) {
        confirmedPresent.push({ groupId: s.group_id, discordId: s.discord_id });
      }
    } catch(e) {}
  }
  
  if (confirmedPresent.length > 0) {
    await heartbeatVoiceSessionsAtomic(confirmedPresent);
  }
}

export async function processVoiceEntryTimeouts(client) {
  const res = await query(`SELECT id FROM aion2_lfg_groups WHERE state = 'VOICE_ENTRY' AND CURRENT_TIMESTAMP >= voice_entry_deadline`);
  for (const row of res.rows) {
    const channelId = await processVoiceEntryTimeoutAtomic(row.id);
    if (channelId) {
       // Attempt immediate best-effort delete
       try {
         const channel = await client.channels.fetch(channelId);
         if (channel) await channel.delete();
         await markVoiceChannelDeletedAtomic(row.id, 'ENTRY_TIMEOUT_CHANNEL_CLEANUP');
       } catch (e) {
         if (e.code === 10003) { // Unknown Channel
           await markVoiceChannelDeletedAtomic(row.id, 'ENTRY_TIMEOUT_CHANNEL_CLEANUP');
         }
         // Else stays pending for durable cleanup worker
       }
    }
  }
}

export async function processEmptyVoiceTimeouts(client) {
  const res = await query(`
    SELECT id FROM aion2_lfg_groups 
    WHERE state = 'ACTIVE' 
    AND empty_voice_deadline IS NOT NULL 
    AND CURRENT_TIMESTAMP >= empty_voice_deadline
  `);
  for (const row of res.rows) {
    const channelId = await processEmptyVoiceTimeoutAtomic(row.id, client);
    if (channelId) {
      await updateEventsCard(row.id).catch(err => {
        console.error(`[LFG] Failed to update EVENTS card for empty voice timeout group ${row.id}:`, err);
      });
      // Attempt immediate best-effort delete
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel) await channel.delete();
        await markVoiceChannelDeletedAtomic(row.id, 'EMPTY_VOICE_TIMEOUT_CHANNEL_CLEANUP');
      } catch (e) {
        if (e.code === 10003) { // Unknown Channel
          await markVoiceChannelDeletedAtomic(row.id, 'EMPTY_VOICE_TIMEOUT_CHANNEL_CLEANUP');
        }
        // Else stays pending for durable cleanup worker
      }
    }
  }
}

export async function processLowVoiceTimeouts(client) {
  const res = await query(`
    SELECT id FROM aion2_lfg_groups 
    WHERE state = 'ACTIVE' 
    AND activity_type = 'DUNGEON'
    AND low_voice_deadline IS NOT NULL 
    AND CURRENT_TIMESTAMP >= low_voice_deadline
  `);
  for (const row of res.rows) {
    const channelId = await processLowVoiceTimeoutAtomic(row.id, client);
    if (channelId) {
      await updateEventsCard(row.id).catch(err => {
        console.error(`[LFG] Failed to update EVENTS card for low voice timeout group ${row.id}:`, err);
      });
      // Attempt immediate best-effort delete
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel) await channel.delete();
        await markVoiceChannelDeletedAtomic(row.id, 'LOW_VOICE_TIMEOUT_CHANNEL_CLEANUP');
      } catch (e) {
        if (e.code === 10003) { // Unknown Channel
          await markVoiceChannelDeletedAtomic(row.id, 'LOW_VOICE_TIMEOUT_CHANNEL_CLEANUP');
        }
        // Else stays pending for durable cleanup worker
      }
    }
  }
}

export async function processDurableDeletions(client) {
  const pending = await getPendingVoiceChannelDeletions();
  for (const group of pending) {
    if (group.state === 'ACTIVE' && group.termination_source) {
      await executeTerminationFlow(group.id, client).catch(() => {});
      continue;
    }
    const deleteReason = group.voice_delete_reason || group.cancellation_reason || 'TERMINAL_CHANNEL_CLEANUP';
    try {
       const channel = await client.channels.fetch(group.voice_channel_id);
       if (channel) await channel.delete();
       await markVoiceChannelDeletedAtomic(group.id, deleteReason);
    } catch (e) {
       if (e.code === 10003) {
         await markVoiceChannelDeletedAtomic(group.id, deleteReason);
       }
       // 403 / 5xx / timeout -> INCONCLUSIVE -> keep pending
    }
  }
}

export async function processPeriodicReconciliation(client) {
  const sessions = await getOpenVoiceSessions();
  for (const s of sessions) {
    let presenceStatus = 'INCONCLUSIVE';
    try {
      const channel = await client.channels.fetch(s.voice_channel_id);
      if (channel && channel.type === 2) {
        presenceStatus = channel.members.has(s.discord_id) ? 'CONFIRMED_PRESENT' : 'INCONCLUSIVE';
      }
    } catch (e) {
      if (e.code === 10003) {
        presenceStatus = 'CHANNEL_DEFINITIVELY_MISSING';
      }
    }

    if (presenceStatus === 'CHANNEL_DEFINITIVELY_MISSING') {
      await processManualChannelDeleteAtomic(s.group_id);
    }
    // We only repair Missed LEAVE definitively via Live Event or Channel Delete.
    // If it's INCONCLUSIVE, we do not close it based on uncertain negative cache.
  }
  
  // Missed JOIN repair
  // Find all ACTIVE/VOICE_ENTRY groups linked to channels
  const activeRes = await query(`SELECT id, voice_channel_id FROM aion2_lfg_groups WHERE state IN ('VOICE_ENTRY', 'ACTIVE') AND voice_delivery_status = 'LINKED'`);
  for (const row of activeRes.rows) {
    try {
      const channel = await client.channels.fetch(row.voice_channel_id).catch(() => null);
      if (channel && channel.type === 2) {
        for (const [memberId, member] of channel.members) {
          // openVoiceSessionAtomic internally checks if they are official lineup and idempotent
          await openVoiceSessionAtomic(row.id, memberId);
        }
      }
    } catch (e) {}
  }
}
