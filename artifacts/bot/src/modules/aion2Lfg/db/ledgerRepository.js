import { query } from '../../../database/index.js';

function getExecutor(client) { return client ? client : { query }; }

export async function getLedgerRow(groupId, discordId, client = null) {
  const res = await getExecutor(client).query(`SELECT * FROM aion2_lfg_ledger WHERE group_id = $1 AND discord_id = $2`, [groupId, discordId]);
  return res.rows[0] || null;
}

export async function getGroupLedgerRows(groupId, client = null) {
  const res = await getExecutor(client).query(`SELECT * FROM aion2_lfg_ledger WHERE group_id = $1`, [groupId]);
  return res.rows;
}

export async function insertLedgerRow(data, client = null) {
  const res = await getExecutor(client).query(`
    INSERT INTO aion2_lfg_ledger (
      group_id, discord_id, activity_type, activity_name, 
      base_points, creator_bonus, anti_farm_multiplier, final_points, 
      monthly_cycle_id, qualification_status, cumulative_voice_seconds, 
      anti_farm_n_value, anti_farm_core_lineage,
      eligibility_cycle_id, voice_required_seconds, is_creator
    ) VALUES (
      $1, $2, $3, $4, 
      $5, $6, $7, $8, 
      $9, $10, $11, 
      $12, $13,
      $14, $15, $16
    )
    ON CONFLICT (group_id, discord_id) DO NOTHING
    RETURNING *
  `, [
    data.groupId, data.discordId, data.activityType, data.activityName,
    data.basePoints, data.creatorBonus, data.antiFarmMultiplier, data.finalPoints,
    data.monthlyCycleId, data.qualificationStatus, data.cumulativeVoiceSeconds,
    data.antiFarmNValue, data.antiFarmCoreLineage,
    data.eligibilityCycleId, data.voiceRequiredSeconds, data.isCreator
  ]);
  return res.rows[0] || null;
}

export async function countOfficialLineup(groupId, client = null) {
  const res = await getExecutor(client).query(`SELECT count(*) as count FROM aion2_lfg_members WHERE group_id = $1 AND is_official_lineup = TRUE`, [groupId]);
  return parseInt(res.rows[0].count, 10);
}

export async function countLedgerRowsForOfficialLineup(groupId, client = null) {
  const res = await getExecutor(client).query(`
    SELECT count(*) as count 
    FROM aion2_lfg_members m
    JOIN aion2_lfg_ledger l ON m.group_id = l.group_id AND m.discord_id = l.discord_id
    WHERE m.group_id = $1 AND m.is_official_lineup = TRUE
  `, [groupId]);
  return parseInt(res.rows[0].count, 10);
}

export async function isGroupLedgerComplete(groupId, client = null) {
  const officialCount = await countOfficialLineup(groupId, client);
  if (officialCount === 0) return false;
  
  const ledgerCount = await countLedgerRowsForOfficialLineup(groupId, client);
  return officialCount === ledgerCount;
}
