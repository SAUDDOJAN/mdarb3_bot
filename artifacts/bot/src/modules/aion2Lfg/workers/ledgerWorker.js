import { pool } from '../../../database/index.js';
import { isGroupLedgerComplete, getLedgerRow } from '../db/ledgerRepository.js';
import { reconcileLeaderboard } from '../leaderboard/render.js';
import { getCapacity } from '../utils/solvers.js';

export async function processCompletedGroup(groupId, client, evaluatorHook = null) {
  // 1. SELECT group data FOR UPDATE
  const groupRes = await client.query(`
    SELECT * FROM aion2_lfg_groups 
    WHERE id = $1
    FOR UPDATE
  `, [groupId]);

  if (groupRes.rowCount === 0) return false;
  const group = groupRes.rows[0];

  // 2. Recheck eligibility
  if (group.state !== 'COMPLETED' || !group.completed_at || group.ledger_processed) {
    return false; // safely no-op
  }

  // 3. Expected capacity check
  const expectedCapacity = getCapacity(group.activity_type);
  const lineupRes = await client.query(`
    SELECT discord_id 
    FROM aion2_lfg_members 
    WHERE group_id = $1 AND is_official_lineup = TRUE
  `, [groupId]);

  if (lineupRes.rowCount !== expectedCapacity) {
    // Quarantine corrupted capacity
    await client.query(`UPDATE aion2_lfg_groups SET cancellation_reason = 'CORRUPTED_LEDGER_CAPACITY' WHERE id = $1`, [groupId]);
    console.error(`[Ledger] Group ${groupId} corrupted capacity ${lineupRes.rowCount} != ${expectedCapacity}. Quarantined.`);
    return true; // We successfully handled this group (by quarantining it)
  }

  // 4. Sort deterministic lineup for deadlock-safe advisory locking
  const lineupIds = lineupRes.rows.map(r => r.discord_id).sort();

  // 5. Acquire Player Advisory Locks in order
  for (const discordId of lineupIds) {
    // We use hashtext('ledger_') as the first 32-bit key, and hashtext(discord_id) as the second.
    // This avoids 32-bit collision and is 100% deterministic per player.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ledger_'), hashtext($1))`, [discordId]);
  }

  // 6. Partial Ledger Recovery: identify missing members
  for (const discordId of lineupIds) {
    const existing = await getLedgerRow(groupId, discordId, client);
    if (!existing && evaluatorHook) {
      // Evaluate and insert for the missing player
      await evaluatorHook(group, discordId, client);
    }
  }

  // 7. Check final coverage
  const isComplete = await isGroupLedgerComplete(groupId, client);
  if (isComplete) {
    await client.query(`UPDATE aion2_lfg_groups SET ledger_processed = TRUE WHERE id = $1`, [groupId]);
  }

  return true;
}

export async function processPendingLedgers(evaluatorHook = null, testActivityName = null, discordClient = null) {
  let processedCount = 0;
  const attemptedIds = [-1]; // Prevent empty array issues in SQL
  
  while (processedCount < 50) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let extraWhere = testActivityName ? ` AND activity_name = $2` : ``;
      let args = testActivityName ? [attemptedIds, testActivityName] : [attemptedIds];

      const candidateRes = await client.query(`
        SELECT id FROM aion2_lfg_groups 
        WHERE state = 'COMPLETED' 
          AND completed_at IS NOT NULL 
          AND ledger_processed = FALSE
          AND (cancellation_reason IS NULL OR cancellation_reason != 'CORRUPTED_LEDGER_CAPACITY')
          AND id != ALL($1::int[])
          ${extraWhere}
        ORDER BY completed_at ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
      `, args);
      
      if (candidateRes.rowCount === 0) {
        await client.query('ROLLBACK');
        break; // No more candidates
      }
      
      const groupId = candidateRes.rows[0].id;
      attemptedIds.push(groupId);
      
      await processCompletedGroup(groupId, client, evaluatorHook);
      
      await client.query('COMMIT');
      processedCount++;
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("[LedgerWorker] Error processing group:", e);
      // We break on error to avoid infinite retry loops inside the same synchronous run.
      // Next periodic run will retry it safely.
      break; 
    } finally {
      client.release();
    }
  }

  // Trigger immediate leaderboard reconciliation if new ledgers were committed
  if (processedCount > 0 && discordClient) {
    try {
      await reconcileLeaderboard(discordClient);
    } catch (err) {
      console.error("[LedgerWorker] Post-commit leaderboard reconcile error:", err);
    }
  }

  return processedCount;
}

let isWorkerRunning = false;
export async function runLedgerWorkerPeriodic(evaluatorHook = null) {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  try {
    await processPendingLedgers(evaluatorHook);
  } finally {
    isWorkerRunning = false;
  }
}
