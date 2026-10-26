import { query } from '../../../database/index.js';
import { getCurrentMonthlyCycle } from '../utils/timeCycles.js';

/**
 * Calculates the deterministic B5 ranking from the immutable ledger.
 * This is the ONLY authoritative source of leaderboard points and tie-breaks.
 */
export async function getMonthlyRankings(targetCycleId) {
  // We use CTEs to cleanly calculate tie breaks across the historical data.

  const sql = `
    WITH PlayerPoints AS (
      SELECT 
        l.discord_id,
        SUM(l.final_points)::INT AS total_points,
        COUNT(DISTINCT l.group_id)::INT AS completed_groups
      FROM aion2_lfg_ledger l
      WHERE l.monthly_cycle_id = $1 AND l.final_points > 0
      GROUP BY l.discord_id
    ),
    UniqueGuildmates AS (
      SELECT 
        l.discord_id,
        COUNT(DISTINCT m.discord_id)::INT AS unique_guildmates
      FROM aion2_lfg_ledger l
      JOIN aion2_lfg_members m ON l.group_id = m.group_id
      WHERE l.monthly_cycle_id = $1 
        AND l.final_points > 0
        AND m.is_official_lineup = TRUE
        AND m.discord_id != l.discord_id
      GROUP BY l.discord_id
    ),
    RunningTotals AS (
      SELECT 
        l.discord_id,
        SUM(l.final_points) OVER (
          PARTITION BY l.discord_id 
          ORDER BY g.completed_at ASC, g.id ASC, l.id ASC
        ) AS cumulative_points,
        g.completed_at,
        g.id AS g_id,
        l.id AS l_id
      FROM aion2_lfg_ledger l
      JOIN aion2_lfg_groups g ON l.group_id = g.id
      WHERE l.monthly_cycle_id = $1 AND l.final_points > 0
    ),
    ReachedTime AS (
      SELECT 
        pp.discord_id,
        MIN(rt.completed_at) AS reached_total_at
      FROM PlayerPoints pp
      JOIN RunningTotals rt ON pp.discord_id = rt.discord_id
      WHERE rt.cumulative_points >= pp.total_points
      GROUP BY pp.discord_id
    )
    
    SELECT 
      p.discord_id,
      p.total_points,
      COALESCE(u.unique_guildmates, 0) AS unique_guildmates,
      p.completed_groups,
      r.reached_total_at,
      RANK() OVER (
        ORDER BY 
          p.total_points DESC, 
          COALESCE(u.unique_guildmates, 0) DESC, 
          p.completed_groups DESC, 
          r.reached_total_at ASC, 
          p.discord_id ASC
      )::INT AS rank
    FROM PlayerPoints p
    LEFT JOIN UniqueGuildmates u ON p.discord_id = u.discord_id
    LEFT JOIN ReachedTime r ON p.discord_id = r.discord_id
    ORDER BY rank ASC;
  `;

  const result = await query(sql, [targetCycleId]);
  return result.rows;
}
