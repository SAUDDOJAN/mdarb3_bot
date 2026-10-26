import { openVoiceSessionAtomic, closeVoiceSessionAtomic } from '../db/engine.js';
import { query } from '../../../database/index.js';

export async function handleAion2VoiceStateUpdate(oldState, newState) {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const joinedNew  = !oldState.channelId && newState.channelId;
  const leftOld    = oldState.channelId && !newState.channelId;
  const movedBetween = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

  // We only care about channels linked to an active AION2 LFG group
  try {
    if (joinedNew) {
      await processJoin(member, newState.channelId);
    } else if (leftOld) {
      await processLeave(member, oldState.channelId);
    } else if (movedBetween) {
      await processLeave(member, oldState.channelId);
      await processJoin(member, newState.channelId);
    }
  } catch (err) {
    console.error("[AION2:VoiceState] Error processing update:", err);
  }
}

async function processJoin(member, channelId) {
  const groupRes = await query(`SELECT id FROM aion2_lfg_groups WHERE voice_channel_id = $1 AND state IN ('VOICE_ENTRY', 'ACTIVE')`, [channelId]);
  if (groupRes.rowCount === 0) return;
  const groupId = groupRes.rows[0].id;
  
  await openVoiceSessionAtomic(groupId, member.id);
}

async function processLeave(member, channelId) {
  const groupRes = await query(`SELECT id FROM aion2_lfg_groups WHERE voice_channel_id = $1`, [channelId]);
  if (groupRes.rowCount === 0) return;
  const groupId = groupRes.rows[0].id;

  // Normal Leave -> Pass true for isNormalLeave
  await closeVoiceSessionAtomic(groupId, member.id, true);
}
