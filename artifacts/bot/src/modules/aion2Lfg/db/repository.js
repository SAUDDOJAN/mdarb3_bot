import { query } from '../../../database/index.js';

/**
 * Repository layer for AION 2 LFG system
 */

export async function createGroup(creatorId, activityType, activityName, activityMode = 'EXPLORATION') {
  // Uses a basic query; caller should handle transaction and lock claiming separately
  const res = await query(`
    INSERT INTO aion2_lfg_groups (creator_id, activity_type, activity_name, activity_mode)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [creatorId, activityType, activityName, activityMode || 'EXPLORATION']);
  return res.rows[0];
}

export async function lockUser(discordId, groupId, clientDB = null) {
  const q = `INSERT INTO aion2_lfg_active_locks (discord_id, group_id) VALUES ($1, $2)`;
  if (clientDB) {
    await clientDB.query(q, [discordId, groupId]);
  } else {
    await query(q, [discordId, groupId]);
  }
}

export async function unlockUser(discordId, clientDB = null) {
  const q = `DELETE FROM aion2_lfg_active_locks WHERE discord_id = $1`;
  if (clientDB) {
    await clientDB.query(q, [discordId]);
  } else {
    await query(q, [discordId]);
  }
}

export async function addMember(groupId, discordId, playerClass, assignedRole, assignedParty = 1, isCreator = false, clientDB = null) {
  const q = `
    INSERT INTO aion2_lfg_members (group_id, discord_id, player_class, assigned_role, assigned_party, is_creator)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const params = [groupId, discordId, playerClass, assignedRole, assignedParty, isCreator];
  if (clientDB) {
    const res = await clientDB.query(q, params);
    return res.rows[0];
  } else {
    const res = await query(q, params);
    return res.rows[0];
  }
}

export async function removeMember(groupId, discordId, clientDB = null) {
  const q = `DELETE FROM aion2_lfg_members WHERE group_id = $1 AND discord_id = $2`;
  if (clientDB) {
    await clientDB.query(q, [groupId, discordId]);
  } else {
    await query(q, [groupId, discordId]);
  }
}

export async function getGroupWithMembers(groupId) {
  const groupRes = await query(`SELECT * FROM aion2_lfg_groups WHERE id = $1`, [groupId]);
  if (groupRes.rowCount === 0) return null;
  const membersRes = await query(`SELECT * FROM aion2_lfg_members WHERE group_id = $1 ORDER BY joined_at ASC`, [groupId]);
  return {
    group: groupRes.rows[0],
    members: membersRes.rows
  };
}

export async function registerVote(groupId, discordId, vote) {
  // Idempotent upsert
  const res = await query(`
    INSERT INTO aion2_lfg_votes (group_id, discord_id, vote)
    VALUES ($1, $2, $3)
    ON CONFLICT (group_id, discord_id) DO UPDATE SET vote = EXCLUDED.vote, voted_at = NOW()
    RETURNING *
  `, [groupId, discordId, vote]);
  return res.rows[0];
}

export async function awardPoints(params, clientDB = null) {
  const q = `
    INSERT INTO aion2_lfg_ledger (
      group_id, discord_id, activity_type, activity_name, 
      base_points, creator_bonus, anti_farm_multiplier, final_points,
      monthly_cycle_id, qualification_status, cumulative_voice_seconds,
      anti_farm_n_value, anti_farm_core_lineage
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (group_id, discord_id) DO NOTHING
    RETURNING *
  `;
  const vals = [
    params.group_id, params.discord_id, params.activity_type, params.activity_name,
    params.base_points, params.creator_bonus, params.anti_farm_multiplier, params.final_points,
    params.monthly_cycle_id, params.qualification_status, params.cumulative_voice_seconds,
    params.anti_farm_n_value, params.anti_farm_core_lineage
  ];
  if (clientDB) {
    const res = await clientDB.query(q, vals);
    return res.rows[0];
  } else {
    const res = await query(q, vals);
    return res.rows[0];
  }
}

export async function getPlayerWeeklyDungeonCount(discordId, weeklyStartUTC) {
  const res = await query(`
    SELECT count(*) as cnt 
    FROM aion2_lfg_ledger 
    WHERE discord_id = $1 
      AND activity_type = 'DUNGEON' 
      AND awarded_at >= $2 
      AND qualification_status = 'QUALIFIED'
  `, [discordId, weeklyStartUTC]);
  return parseInt(res.rows[0].cnt, 10);
}

export async function openVoiceSession(groupId, discordId) {
  // Ensure no other open session for this user in this group
  await query(`UPDATE aion2_lfg_voice_sessions SET left_at = NOW() WHERE group_id = $1 AND discord_id = $2 AND left_at IS NULL`, [groupId, discordId]);
  const res = await query(`
    INSERT INTO aion2_lfg_voice_sessions (group_id, discord_id)
    VALUES ($1, $2)
    RETURNING *
  `, [groupId, discordId]);
  return res.rows[0];
}

export async function closeVoiceSession(groupId, discordId) {
  await query(`
    UPDATE aion2_lfg_voice_sessions 
    SET left_at = NOW() 
    WHERE group_id = $1 AND discord_id = $2 AND left_at IS NULL
  `, [groupId, discordId]);
}
