import { pool } from '../../../database/index.js';

export async function processFallbackExpiries() {
  let processedCount = 0;
  while (true) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const reqRes = await client.query(`
        SELECT r.id, g.id as group_id
        FROM aion2_lfg_vote_requests r
        JOIN aion2_lfg_groups g ON r.group_id = g.id
        WHERE g.state = 'ACTIVE' 
          AND r.resolved_at IS NULL 
          AND r.expires_at <= CURRENT_TIMESTAMP
        FOR UPDATE SKIP LOCKED LIMIT 1
      `);
      
      if (reqRes.rowCount === 0) {
        await client.query('ROLLBACK');
        break;
      }
      
      const req = reqRes.rows[0];
      
      await client.query(`
        UPDATE aion2_lfg_vote_requests 
        SET resolved_at = CURRENT_TIMESTAMP, resolution = 'EXPIRED' 
        WHERE id = $1
      `, [req.id]);
      
      await client.query(`
        UPDATE aion2_lfg_groups
        SET events_render_pending = TRUE, events_render_version = events_render_version + 1
        WHERE id = $1
      `, [req.group_id]);
      
      await client.query('COMMIT');
      processedCount++;
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[LFG] Error processing fallback expiry', e);
      break;
    } finally {
      client.release();
    }
  }
  return processedCount;
}
