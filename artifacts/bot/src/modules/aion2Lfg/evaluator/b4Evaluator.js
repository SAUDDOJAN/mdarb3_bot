import { 
  getCurrentMonthlyCycle, 
  getCurrentWeeklyCycleStart, 
  getCurrentDailyCycleStart 
} from '../utils/timeCycles.js';
import { insertLedgerRow } from '../db/ledgerRepository.js';
import { setLeaderboardDirty } from '../leaderboard/render.js';
import { getActivityConfig } from '../utils/activitiesConfig.js';

export async function countEligibleRuns(discordId, activityType, eligibilityCycleId, client) {
  const res = await client.query(`
    SELECT count(*) as c FROM aion2_lfg_ledger
    WHERE discord_id = $1
    AND activity_type = $2
    AND eligibility_cycle_id = $3
    AND final_points > 0
    AND qualification_status = 'QUALIFIED'
  `, [discordId, activityType, eligibilityCycleId]);
  return parseInt(res.rows[0].c, 10);
}

export async function b4EvaluatorHook(group, discordId, client) {
  // get member info
  const memberRes = await client.query(`
    SELECT is_creator, cumulative_voice_seconds 
    FROM aion2_lfg_members 
    WHERE group_id = $1 AND discord_id = $2 AND is_official_lineup = TRUE
  `, [group.id, discordId]);
  
  if (memberRes.rowCount === 0) return; // Should not happen for an official lineup query
  
  const member = memberRes.rows[0];
  const config = getActivityConfig(group.activity_name, group.activity_mode || 'EXPLORATION');
  
  if (!config) {
    throw new Error(`UNKNOWN_ACTIVITY_NAME: ${group.activity_name}`);
  }
  
  const voiceSecs = member.cumulative_voice_seconds || 0;
  let isQual = voiceSecs >= config.reqSeconds;
  
  let status = isQual ? 'QUALIFIED' : 'INSUFFICIENT_VOICE';
  
  let basePoints = 0;
  let creatorBonus = 0;
  let finalPoints = 0;
  
  if (isQual) {
    if (config.type === 'DUNGEON' || config.type === 'ABYSS' || config.type === 'TRANSCENDENCE' || config.type === 'WORLD_BOSS') {
      basePoints = 10;
      creatorBonus = member.is_creator ? 2 : 0;
    } else if (config.type === 'SANCTUARY') {
      basePoints = 30;
      creatorBonus = member.is_creator ? 6 : 0;
    }
  }
  
  const completedAt = group.completed_at;
  const monthCycle = getCurrentMonthlyCycle(completedAt).cycleId;
  
  // Create deterministic string ID for eligibility cycle
  let eligCycle = '';
  if (config.type === 'ABYSS' || config.type === 'WORLD_BOSS') {
    eligCycle = 'DAILY_' + getCurrentDailyCycleStart(completedAt).toISOString();
  } else {
    eligCycle = 'WEEKLY_' + getCurrentWeeklyCycleStart(completedAt).toISOString();
  }

  // B4.4 Eligibility Cap Evaluation
  let isEligible = false;
  if (isQual) {
    if (config.cap === null || config.cap === undefined || !isFinite(config.cap)) {
      isEligible = true;
      finalPoints = basePoints + creatorBonus;
    } else {
      const currentEligibleRuns = await countEligibleRuns(discordId, config.type, eligCycle, client);
      if (currentEligibleRuns >= config.cap) {
        status = 'ELIGIBILITY_LIMIT_REACHED';
        finalPoints = 0;
        // basePoints and creatorBonus are preserved for audit
      } else {
        isEligible = true;
        finalPoints = basePoints + creatorBonus;
      }
    }
  }

  // B4.5 Core-4 Anti-Farm
  let nValue = 1;
  let multiplier = 1.0;
  let coreLineage = null;

  if (isQual && isEligible && (config.type === 'DUNGEON' || config.type === 'ABYSS' || config.type === 'TRANSCENDENCE')) {
    const lineupRes = await client.query(`
      SELECT discord_id 
      FROM aion2_lfg_members 
      WHERE group_id = $1 AND is_official_lineup = TRUE
    `, [group.id]);
    const lineup = lineupRes.rows.map(r => r.discord_id);
    const others = lineup.filter(id => id !== discordId);

    if (others.length === 4) {
      const cores = [];
      for (let i = 0; i < 4; i++) {
        const subset = [discordId];
        for (let j = 0; j < 4; j++) {
          if (i !== j) subset.push(others[j]);
        }
        subset.sort();
        cores.push(subset.join('|'));
      }
      cores.sort(); // sort the array of cores itself for deterministic serialization
      coreLineage = JSON.stringify(cores);

      const core4WeeklyStart = getCurrentWeeklyCycleStart(completedAt);
      const core4WeeklyEnd = new Date(core4WeeklyStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      const historyRes = await client.query(`
        SELECT l.anti_farm_core_lineage 
        FROM aion2_lfg_ledger l
        JOIN aion2_lfg_groups g ON l.group_id = g.id
        WHERE l.discord_id = $1
          AND l.activity_type = $2
          AND l.final_points > 0
          AND l.qualification_status = 'QUALIFIED'
          AND l.anti_farm_core_lineage IS NOT NULL
          AND g.completed_at >= $3::timestamp
          AND g.completed_at < $4::timestamp
      `, [discordId, config.type, core4WeeklyStart.toISOString(), core4WeeklyEnd.toISOString()]);

      const coreCounts = { [cores[0]]: 0, [cores[1]]: 0, [cores[2]]: 0, [cores[3]]: 0 };

      for (const row of historyRes.rows) {
        try {
          const historicalCores = JSON.parse(row.anti_farm_core_lineage);
          for (const c of cores) {
            if (historicalCores.includes(c)) {
              coreCounts[c]++;
            }
          }
        } catch (e) {}
      }

      const maxPrevious = Math.max(...Object.values(coreCounts));
      nValue = maxPrevious + 1;

      if (nValue >= 6) {
        multiplier = 0.25;
      } else if (nValue >= 4) {
        multiplier = 0.5;
      } else {
        multiplier = 1.0;
      }

      finalPoints = Math.floor(finalPoints * multiplier);
    }
  }

  const ledgerData = {
    groupId: group.id,
    discordId: discordId,
    activityType: config.type,
    activityName: group.activity_name,
    basePoints: basePoints,
    creatorBonus: creatorBonus,
    antiFarmMultiplier: multiplier,
    finalPoints: finalPoints,
    monthlyCycleId: monthCycle,
    qualificationStatus: status,
    cumulativeVoiceSeconds: voiceSecs,
    antiFarmNValue: nValue,
    antiFarmCoreLineage: coreLineage,
    eligibilityCycleId: eligCycle,
    voiceRequiredSeconds: config.reqSeconds,
    isCreator: member.is_creator
  };
  
  await insertLedgerRow(ledgerData, client);
  await setLeaderboardDirty(client);
}
