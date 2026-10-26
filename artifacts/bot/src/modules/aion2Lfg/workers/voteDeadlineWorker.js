import { pool } from '../../../database/index.js';
import { getCapacity } from '../utils/solvers.js';

export async function processVoteDeadlines() {
  let processedCount = 0;
  while (true) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const groupRes = await client.query(`
        SELECT id, activity_type FROM aion2_lfg_groups 
        WHERE state = 'AWAITING_VOTE' 
          AND vote_deadline <= CURRENT_TIMESTAMP
          AND (cancellation_reason IS NULL OR cancellation_reason != 'CORRUPTED_ELECTORATE_CAPACITY')
        FOR UPDATE SKIP LOCKED LIMIT 1
      `);
      
      if (groupRes.rowCount === 0) {
        await client.query('ROLLBACK');
        break;
      }
      
      const groupId = groupRes.rows[0].id;
      const expectedCapacity = getCapacity(groupRes.rows[0].activity_type);
      
      const lineupRes = await client.query(`SELECT count(*) as count FROM aion2_lfg_members WHERE group_id = $1 AND is_official_lineup = TRUE`, [groupId]);
      const electorateSize = parseInt(lineupRes.rows[0].count, 10);
      
      if (electorateSize !== expectedCapacity) {
        // Validation failure. Quarantine the group by writing to cancellation_reason,
        // but preserve state='AWAITING_VOTE', deadline, locks, and history.
        await client.query(`
          UPDATE aion2_lfg_groups 
          SET cancellation_reason = 'CORRUPTED_ELECTORATE_CAPACITY'
          WHERE id = $1
        `, [groupId]);
        await client.query('COMMIT');
        console.error(`[LFG] ERROR: Group ${groupId} corrupted electorate size ${electorateSize} != ${expectedCapacity}. Quarantined.`);
        continue;
      }
      
      const requiredYes = Math.floor(electorateSize / 2) + 1;
      
      const voteRes = await client.query(`
        SELECT 
          SUM(CASE WHEN vote = 'YES' THEN 1 ELSE 0 END) as yes_count
        FROM aion2_lfg_votes WHERE group_id = $1
      `, [groupId]);
      
      const yesCount = parseInt(voteRes.rows[0].yes_count || 0, 10);
      
      if (yesCount >= requiredYes) {
        await client.query(`
          UPDATE aion2_lfg_groups 
          SET state = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, events_render_pending = TRUE, events_render_version = events_render_version + 1
          WHERE id = $1
        `, [groupId]);
        await client.query(`
          UPDATE aion2_lfg_members SET status = 'COMPLETED', left_at = COALESCE(left_at, CURRENT_TIMESTAMP)
          WHERE group_id = $1 AND status = 'ACTIVE'
        `, [groupId]);
      } else {
        await client.query(`
          UPDATE aion2_lfg_groups 
          SET state = 'FAILED', failed_at = CURRENT_TIMESTAMP, events_render_pending = TRUE, events_render_version = events_render_version + 1
          WHERE id = $1
        `, [groupId]);
        await client.query(`
          UPDATE aion2_lfg_members SET status = 'FAILED', left_at = COALESCE(left_at, CURRENT_TIMESTAMP)
          WHERE group_id = $1 AND status = 'ACTIVE'
        `, [groupId]);
      }
      
      await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);
      
      await client.query('COMMIT');
      processedCount++;
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[LFG] Error processing vote deadline', e);
      break;
    } finally {
      client.release();
    }
  }
  return processedCount;
}
