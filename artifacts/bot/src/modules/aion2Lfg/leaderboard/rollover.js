import { query, pool } from '../../../database/index.js';
import { getCurrentMonthlyCycle } from '../utils/timeCycles.js';
import { getMonthlyRankings } from './ranking.js';

export async function finalizeMonthlyCycles() {
  const lockClient = await pool.connect();
  let locked = false;
  try {
    const lockRes = await lockClient.query('SELECT pg_try_advisory_lock(155249297)');
    if (!lockRes.rows[0].pg_try_advisory_lock) return;
    locked = true;

    const { cycleId: currentCycleId, cycleStartUTC } = getCurrentMonthlyCycle();

    // Find cycles that exist in the ledger but are NOT finalized, and are NOT the current cycle
    const pendingCyclesRes = await lockClient.query(`
      SELECT DISTINCT monthly_cycle_id 
      FROM aion2_lfg_ledger 
      WHERE monthly_cycle_id != $1
        AND monthly_cycle_id NOT IN (SELECT cycle_id FROM aion2_lfg_monthly_cycles WHERE is_finalized = TRUE)
    `, [currentCycleId]);

    for (const row of pendingCyclesRes.rows) {
      const targetCycle = row.monthly_cycle_id;

      // 1. LATE LEDGER SAFETY BLOCK
      // Are there any COMPLETED groups matching this cycle that are not yet ledger_processed?
      // Since monthly_cycle_id is derived from completed_at, we must deduce the bounds for the old cycle.
      // Wait, instead of calculating bounds in SQL, we can just look for groups whose completed_at would place them in targetCycle.
      // Or safer: just check all COMPLETED unprocessed groups, and see if their derived cycle matches.
      // Better yet, in B4, when a group finishes, it gets completed_at.
      // Let's do a strict query:
      // Actually, since we don't store cycle_id on the group, we can just say: if ANY group is COMPLETED and ledger_processed=FALSE, and its completed_at < cycleStartUTC, it belongs to an old cycle!
      // If ANY such group exists, it might belong to our targetCycle, blocking finalization.
      
      const blockerRes = await lockClient.query(`
        SELECT id FROM aion2_lfg_groups 
        WHERE state = 'COMPLETED' 
          AND ledger_processed = FALSE 
          AND completed_at < $1
        LIMIT 1
      `, [cycleStartUTC]);

      if (blockerRes.rowCount > 0) {
        console.warn(`[Rollover] Finalization for cycle ${targetCycle} BLOCKED by unprocessed late group: ${blockerRes.rows[0].id}`);
        continue; // Blocked!
      }

      // Safe to finalize!
      await lockClient.query('BEGIN');

      // Ensure cycle record exists
      await lockClient.query(`
        INSERT INTO aion2_lfg_monthly_cycles (cycle_id, cycle_start, cycle_end) 
        VALUES ($1, '1970-01-01', '1970-01-01') ON CONFLICT DO NOTHING
      `, [targetCycle]);

      const rankings = await getMonthlyRankings(targetCycle);

      for (const r of rankings) {
        await lockClient.query(`
          INSERT INTO aion2_lfg_monthly_rankings (
            cycle_id, discord_id, final_rank, total_points, unique_guildmates, completed_groups, reached_total_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (cycle_id, discord_id) DO NOTHING
        `, [targetCycle, r.discord_id, r.rank, r.total_points, r.unique_guildmates, r.completed_groups, r.reached_total_at]);

      }

      await lockClient.query(`
        UPDATE aion2_lfg_monthly_cycles 
        SET is_finalized = TRUE, finalized_at = NOW() 
        WHERE cycle_id = $1
      `, [targetCycle]);

      await lockClient.query(`
        UPDATE aion2_lfg_leaderboard_state
        SET last_top5 = '[]'::jsonb, is_dirty = TRUE
      `);

      await lockClient.query('COMMIT');
      console.log(`[Rollover] Finalized cycle ${targetCycle} successfully.`);
    }

  } catch (err) {
    await lockClient.query('ROLLBACK').catch(() => {});
    console.error("[Rollover] Error:", err);
  } finally {
    if (locked) {
      await lockClient.query('SELECT pg_advisory_unlock(155249297)');
    }
    lockClient.release();
  }
}
