import { pool } from '../../database/index.js';
import { closeGroupSystemAtomic } from './db/engine.js';
import { fetchGroupState, buildGroupCard } from './eventsCard.js';
import { processVoteDeliveries } from './workers/voteDeliveryWorker.js';
import { processVoteDeadlines } from './workers/voteDeadlineWorker.js';
import { processFallbackExpiries } from './workers/fallbackExpiryWorker.js';
import { processPendingLedgers } from './workers/ledgerWorker.js';
import { b4EvaluatorHook } from './evaluator/b4Evaluator.js';
import { finalizeMonthlyCycles } from './leaderboard/rollover.js';
import { reconcileLeaderboard } from './leaderboard/render.js';

const EVENTS_CHANNEL_ID = '1548359577307717683';
let isReconciling = false;

// Convert JS Date to Discord Snowflake
function getSnowflake(date) {
  const DISCORD_EPOCH = 1420070400000n;
  const timestamp = BigInt(date.getTime());
  return ((timestamp - DISCORD_EPOCH) << 22n).toString();
}

/**
 * Main Reconciler Entry
 */
export async function reconcileLfgEventsCards(client) {
  if (isReconciling) return;
  isReconciling = true;

  try {
    const channel = await client.channels.fetch(EVENTS_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error("Reconciler: Could not fetch EVENTS channel");
      return;
    }

    // 1. NOT_STARTED Startup Recovery (Crash before PENDING)
    await processNotStarted();

    // 2. PENDING Bounded Recovery
    await processPendingDeliveries(channel, client.user.id);

    // 3. LINKED Reconciliation (Deleted cards or stale edits)
    await processLinkedReconciliation(channel);

    // 4. Dirty Renders (Terminal/Stale repairs)
    await processDirtyRenders(channel);

    // 5. Voice Creation Recovery
    await processVoiceCreationRecovery(client);

    // 6. B3.4 Vote Workers (Startup)
    await processVoteDeadlines();
    await processFallbackExpiries();
    await processVoteDeliveries();
    
    // 7. B4.2 Ledger Worker (Startup)
    await processPendingLedgers(b4EvaluatorHook, null, client);

    // 8. B5 Monthly Rollover & Leaderboard Reconciliation (Startup)
    await finalizeMonthlyCycles();
    await reconcileLeaderboard(client);

  } catch (err) {
    console.error("Reconciler Error:", err);
  } finally {
    isReconciling = false;
  }
}

let isDirtyReconciling = false;
export async function periodicDirtyReconciliation(client) {
  if (isDirtyReconciling) return;
  isDirtyReconciling = true;
  try {
    const channel = await client.channels.fetch(EVENTS_CHANNEL_ID).catch(() => null);
    if (channel) {
      await processDirtyRenders(channel);
    }
    await processVoiceCreationRecovery(client);
    
    // B3.4 Vote Workers (Periodic)
    await processVoteDeadlines();
    await processFallbackExpiries();
    await processVoteDeliveries();
    
    // B4.2 Ledger Worker (Periodic)
    await processPendingLedgers(b4EvaluatorHook, null, client);

    // B5 Monthly Rollover & Leaderboard Reconciliation (Periodic)
    await finalizeMonthlyCycles();
    await reconcileLeaderboard(client);
  } catch(e) {
    console.error("Periodic Dirty Reconciler Error:", e);
  } finally {
    isDirtyReconciling = false;
  }
}

async function processNotStarted() {
  // If active group has NOT_STARTED, Discord send was never attempted. System close it.
  const res = await pool.query(`
    SELECT id FROM aion2_lfg_groups 
    WHERE events_delivery_status = 'NOT_STARTED' 
    AND state IN ('RECRUITING', 'FULL_WAITING_FOR_VOICE')
  `);
  
  for (const row of res.rows) {
    console.log(`Reconciler: NOT_STARTED recovery for group ${row.id}`);
    await closeGroupSystemAtomic(row.id, 'EVENTS_DELIVERY_NOT_STARTED_RECOVERY', 'NOT_STARTED');
  }
}

async function processPendingDeliveries(channel, botId) {
  const res = await pool.query(`
    SELECT id, group_uuid, events_delivery_started_at 
    FROM aion2_lfg_groups 
    WHERE events_delivery_status = 'PENDING'
  `);

  for (const group of res.rows) {
    const startedAtMs = group.events_delivery_started_at.getTime();
    const nowMs = Date.now();
    const upperBoundMs = startedAtMs + (2 * 60 * 1000); // +2 minutes
    
    // Wait for the upper bound to pass before deciding CONFIRMED_ABSENT
    if (nowMs <= upperBoundMs) {
      continue; // INCONCLUSIVE/WAIT
    }

    // Begin Bounded Scan
    const lowerBoundMs = startedAtMs - (10 * 1000); // -10 seconds
    const afterSnowflake = getSnowflake(new Date(lowerBoundMs));
    
    let messages;
    try {
      messages = await fetchBoundedMessages(channel, afterSnowflake, upperBoundMs);
    } catch(err) {
      console.error(`Reconciler: Inconclusive API error for group ${group.id}:`, err);
      continue; // INCONCLUSIVE
    }
    
    if (!messages) {
       // Pagination didn't cover the window or hit an error
       continue; // INCONCLUSIVE
    }

    // Filter matching cards
    const matches = messages.filter(m => 
      m.author.id === botId && 
      m.embeds.length > 0 && 
      m.embeds[0].footer?.text === `M3RGEEN_LFG:v1:${group.group_uuid}`
    );

    if (matches.length === 0) {
      // CONFIRMED_ABSENT
      console.log(`Reconciler: CONFIRMED_ABSENT for group ${group.id}`);
      await closeGroupSystemAtomic(group.id, 'EVENTS_DELIVERY_FAILED', 'PENDING');
    } else if (matches.length === 1) {
      // FOUND_ONE
      console.log(`Reconciler: FOUND_ONE for group ${group.id}, linking...`);
      await linkAndEditCanonical(channel, group.id, matches[0]);
    } else {
      // FOUND_DUPLICATES
      console.log(`Reconciler: FOUND_DUPLICATES for group ${group.id}`);
      matches.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      const canonical = matches[0];
      const duplicates = matches.slice(1);
      
      // FIRST: Link Canonical
      await linkAndEditCanonical(channel, group.id, canonical);
      
      // THEN: Delete duplicates best-effort
      for (const dup of duplicates) {
        try {
          await dup.delete();
        } catch(e) {
          console.warn(`Reconciler: Failed to delete duplicate card ${dup.id}`);
        }
      }
    }
  }
}

/**
 * Fetches messages after a snowflake until the message timestamps exceed upperBoundMs.
 * Returns Array of messages or null if inconclusive.
 */
async function fetchBoundedMessages(channel, afterSnowflake, upperBoundMs) {
  let allMessages = [];
  let currentAfter = afterSnowflake;
  
  while (true) {
    const fetched = await channel.messages.fetch({ after: currentAfter, limit: 100 });
    if (fetched.size === 0) break; // Reached the present
    
    const sorted = Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    allMessages.push(...sorted);
    
    const lastMsg = sorted[sorted.length - 1];
    if (lastMsg.createdTimestamp > upperBoundMs) {
      break; // Successfully scanned past the upper bound
    }
    
    currentAfter = lastMsg.id;
  }
  
  // Verify we actually covered the upper bound or reached the present (no more messages)
  return allMessages;
}

async function linkAndEditCanonical(channel, groupId, msg) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Link atomically
    const upd = await client.query(`
      UPDATE aion2_lfg_groups 
      SET events_message_id = $1, events_delivery_status = 'LINKED'
      WHERE id = $2 AND events_delivery_status = 'PENDING'
    `, [msg.id, groupId]);
    await client.query("COMMIT");
    
    if (upd.rowCount === 1) {
      // Edit UI
      const state = await fetchGroupState(groupId);
      if (state) {
        const { embeds, components } = buildGroupCard(state.group, state.members);
        await msg.edit({ embeds, components }).catch(() => {});
      }
    }
  } catch(e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function processLinkedReconciliation(channel) {
  const res = await pool.query(`
    SELECT id, events_message_id FROM aion2_lfg_groups 
    WHERE events_delivery_status = 'LINKED' 
    AND state IN ('RECRUITING', 'FULL_WAITING_FOR_VOICE')
  `);
  
  for (const group of res.rows) {
    try {
      const msg = await channel.messages.fetch(group.events_message_id);
      // Valid message, repair UI
      const state = await fetchGroupState(group.id);
      if (state) {
        const { embeds, components } = buildGroupCard(state.group, state.members);
        await msg.edit({ embeds, components }).catch(() => {});
      }
    } catch(err) {
      if (err.code === 10008) { // Unknown Message
        console.log(`Reconciler: Linked message deleted for group ${group.id}`);
        await closeGroupSystemAtomic(group.id, 'EVENTS_MESSAGE_DELETED', 'LINKED');
      } else {
        // INCONCLUSIVE (e.g. 500, Timeout, Rate Limit)
      }
    }
  }
}

export async function processDirtyRenders(channel) {
  // Use FOR UPDATE SKIP LOCKED to prevent multiple workers rendering the same group
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(`
      SELECT id, events_message_id, events_render_version FROM aion2_lfg_groups 
      WHERE events_render_pending = TRUE 
      AND events_message_id IS NOT NULL 
      AND events_delivery_status = 'LINKED'
      FOR UPDATE SKIP LOCKED
    `);

    for (const group of res.rows) {
      try {
        const msg = await channel.messages.fetch(group.events_message_id);
        const state = await fetchGroupState(group.id);
        if (state) {
          const { embeds, components } = buildGroupCard(state.group, state.members);
          await msg.edit({ embeds, components });
          
          // Clear conditional on version
          await client.query(`
            UPDATE aion2_lfg_groups 
            SET events_render_pending = FALSE 
            WHERE id = $1 AND events_render_version = $2
          `, [group.id, group.events_render_version]);
        }
      } catch(err) {
        if (err.code === 10008) { // Unknown Message
          console.log(`Reconciler (Dirty): Unknown Message ${group.events_message_id} for group ${group.id}`);
          // Leave pending TRUE, do not rollback lifecycle, just log.
        } else {
          // 5xx, timeout, network error: Leave pending TRUE.
        }
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Dirty Render Reconciler Error:", err);
  } finally {
    client.release();
  }
}

export async function processVoiceCreationRecovery(clientDiscord) {
  const VOICE_CATEGORY_ID = '1552456426885087284';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(`
      SELECT * FROM aion2_lfg_groups
      WHERE state = 'VOICE_CREATING' 
      AND voice_delivery_status = 'PENDING'
      FOR UPDATE SKIP LOCKED
    `);

    if (res.rowCount === 0) {
      await client.query('COMMIT');
      return;
    }

    const category = await clientDiscord.channels.fetch(VOICE_CATEGORY_ID).catch(() => null);
    if (!category || category.type !== 4) {
      console.error("Reconciler: Voice Category not found or invalid.");
      await client.query('COMMIT');
      return;
    }

    // Fetch all channels in category
    const categoryChannels = category.children.cache.filter(c => c.type === 2); // GuildVoice

    for (const group of res.rows) {
      const token = group.voice_identity_token;
      if (!token) continue;

      const candidates = categoryChannels.filter(c => c.name.endsWith(`・${token}`));
      
      if (candidates.size === 1) {
        const foundChannel = candidates.first();
        // Atomically link
        await client.query(`
          UPDATE aion2_lfg_groups
          SET state = 'VOICE_ENTRY',
              voice_delivery_status = 'LINKED',
              voice_channel_id = $2,
              voice_entry_deadline = CURRENT_TIMESTAMP + INTERVAL '10 minutes',
              events_render_pending = TRUE,
              events_render_version = events_render_version + 1
          WHERE id = $1
        `, [group.id, foundChannel.id]);
        console.log(`[LFG Recovery] Linked orphan voice channel ${foundChannel.id} for group ${group.id}`);
      } else if (candidates.size > 1) {
        console.warn(`[LFG Recovery] Multiple channels found for token ${token}. NEEDS_ADMIN_REVIEW.`);
      } else {
        // 0 channels found
        if (group.voice_creation_recovery_deadline && new Date() > new Date(group.voice_creation_recovery_deadline)) {
          // Deadline expired without any channel creation
          await client.query(`
            UPDATE aion2_lfg_groups
            SET state = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = 'VOICE_CREATION_NEEDS_ADMIN_REVIEW',
                events_render_pending = TRUE, events_render_version = events_render_version + 1
            WHERE id = $1
          `, [group.id]);
          await client.query(`UPDATE aion2_lfg_members SET status = 'CANCELLED', left_at = CURRENT_TIMESTAMP WHERE group_id = $1 AND status = 'ACTIVE'`, [group.id]);
          await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [group.id]);
          console.log(`[LFG Recovery] Cancelled group ${group.id} due to voice creation timeout.`);
        }
      }
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Voice Creation Recovery Error:", err);
  } finally {
    client.release();
  }
}
