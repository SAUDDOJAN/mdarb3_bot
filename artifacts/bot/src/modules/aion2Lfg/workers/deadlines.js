import { query } from '../../../database/index.js';
import { 
  expireVoiceStartAtomic, 
  expireRecruitmentAtomic, 
  processEmptyVoiceTimeoutAtomic, 
  processLowVoiceTimeoutAtomic,
  requestActivityTerminationAtomic,
  executeTerminationFlow
} from '../db/engine.js';
import { updateEventsCard } from '../eventsCard.js';

export async function processDeadlines() {
  let processed = 0;
  
  // 1. Process Recruitment Expiries
  const recruitExpiredRes = await query(`
    SELECT id FROM aion2_lfg_groups 
    WHERE state = 'RECRUITING' 
    AND recruitment_deadline <= CURRENT_TIMESTAMP
  `);

  for (const row of recruitExpiredRes.rows) {
    const expired = await expireRecruitmentAtomic(row.id);
    if (expired) {
      await updateEventsCard(row.id).catch(err => {
        console.error(`[LFG] Failed to update EVENTS card for recruit expired group ${row.id}:`, err);
      });
      processed++;
    }
  }

  // 2. Process Voice Start Expiries
  const expiredRes = await query(`
    SELECT id FROM aion2_lfg_groups 
    WHERE state = 'FULL_WAITING_FOR_VOICE' 
    AND voice_start_deadline <= CURRENT_TIMESTAMP
  `);

  for (const row of expiredRes.rows) {
    const expired = await expireVoiceStartAtomic(row.id);
    if (expired) {
      // Trigger best-effort EVENTS card update (B2 reconciliation will fix if it fails)
      await updateEventsCard(row.id).catch(err => {
        console.error(`[LFG] Failed to update EVENTS card for expired group ${row.id}:`, err);
      });
      processed++;
    }
  }

  // 3. Process Empty Voice Timeouts
  const emptyExpiredRes = await query(`
    SELECT id FROM aion2_lfg_groups 
    WHERE state = 'ACTIVE' 
    AND empty_voice_deadline IS NOT NULL 
    AND empty_voice_deadline <= CURRENT_TIMESTAMP
  `);

  for (const row of emptyExpiredRes.rows) {
    const channelId = await processEmptyVoiceTimeoutAtomic(row.id);
    if (channelId) {
      await updateEventsCard(row.id).catch(err => {
        console.error(`[LFG] Failed to update EVENTS card for empty voice timeout group ${row.id}:`, err);
      });
      processed++;
    }
  }

  // 4. Process Low Voice Timeouts (5-player Dungeons)
  const lowExpiredRes = await query(`
    SELECT id FROM aion2_lfg_groups 
    WHERE state = 'ACTIVE' 
    AND activity_type = 'DUNGEON'
    AND low_voice_deadline IS NOT NULL 
    AND low_voice_deadline <= CURRENT_TIMESTAMP
  `);

  for (const row of lowExpiredRes.rows) {
    const channelId = await processLowVoiceTimeoutAtomic(row.id);
    if (channelId) {
      await updateEventsCard(row.id).catch(err => {
        console.error(`[LFG] Failed to update EVENTS card for low voice timeout group ${row.id}:`, err);
      });
      processed++;
    }
  }

  return processed;
}

export async function processActivityDeadlines(client) {
  let processed = 0;

  // 1. Process 80-minute activity duration timeouts
  try {
    const expiredRes = await query(`
      SELECT id FROM aion2_lfg_groups 
      WHERE state = 'ACTIVE' 
        AND activity_deadline IS NOT NULL 
        AND activity_deadline <= CURRENT_TIMESTAMP 
        AND termination_source IS NULL
    `);
    for (const row of expiredRes.rows) {
      const termReq = await requestActivityTerminationAtomic(row.id, 'MAX_DURATION');
      if (termReq.success) {
        await executeTerminationFlow(row.id, client).catch(err => {
          console.error(`[LFG Activity Deadline] Error executing termination for group ${row.id}:`, err);
        });
        processed++;
      }
    }
  } catch (err) {
    console.error("[LFG Activity Deadline Worker] Error checking max activity deadline:", err);
  }

  // 2. Retry any pending terminations (e.g. after restart or transient network fault)
  try {
    const pendingRes = await query(`
      SELECT id FROM aion2_lfg_groups 
      WHERE state = 'ACTIVE' 
        AND termination_source IS NOT NULL
    `);
    for (const row of pendingRes.rows) {
      await executeTerminationFlow(row.id, client).catch(err => {
        console.error(`[LFG Termination Retry Worker] Error retrying termination for group ${row.id}:`, err);
      });
    }
  } catch (err) {
    console.error("[LFG Activity Deadline Worker] Error retrying pending terminations:", err);
  }

  return processed;
}
