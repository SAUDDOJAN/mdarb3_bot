import { handleVoiceJoin, handleVoiceLeave } from "../tasks/voiceTracker.js";
import { query } from "../database/index.js";

export default {
  name: "voiceStateUpdate",
  once: false,
  async execute(oldState, newState, client) {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    const joinedNew  = !oldState.channelId && newState.channelId;
    const leftOld    = oldState.channelId && !newState.channelId;
    const movedBetween = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;
    
    console.log(`[VoiceStateUpdate] User ${member.user.tag} in Guild ${newState.guild.id}. joinedNew=${joinedNew}, moved=${movedBetween}`);

    // ─── Siege Alliance Voice Access Control ──────────────────────────────
    const SAGE_GUILD_ID = process.env.SAGE_GUILD_ID || "1507696012410749030";
    if (newState.guild.id === SAGE_GUILD_ID && (joinedNew || movedBetween)) {
      const ADMIN_ROLES = ["1507733275278577916", "1507733319989858435", "1507733404781645874", "1507733486671233175"];
      const hasAdminRole = ADMIN_ROLES.some(roleId => member.roles.cache.has(roleId));
      
      if (!hasAdminRole) {
        const nowKSA = new Date(Date.now() + 3 * 60 * 60 * 1000);
        const day = nowKSA.getUTCDay();
        const h = nowKSA.getUTCHours();
        const m = nowKSA.getUTCMinutes();
        
        const isSiegeDay = (day === 3 || day === 6);
        const isSiegeTime = isSiegeDay && ((h === 16 && m >= 30) || (h === 17));
        
        if (!isSiegeTime) {
          console.log(`[SiegeVoiceControl] Kicking ${member.user.tag} (Not Siege Time)`);
          await newState.disconnect().catch(err => console.error("[SiegeVoiceControl] Failed to disconnect:", err));
          await member.send("🛑 **تحذير / Warning:**\nعذراً، استخدام القنوات الصوتية في سيرفر تحالف القيلدات مسموح فقط أثناء فترات السيج (من 4:30 م إلى 6:00 م بتوقيت مكة أيام الأربعاء والسبت). السيرفر مخصص لتجمعات السيج فقط وليس للسواليف!\n\nSorry, using voice channels in the Siege Alliance server is only allowed during Siege periods (from 4:30 PM to 6:00 PM KSA time on Wednesdays and Saturdays). The server is strictly for Siege gatherings, not for hanging out!").catch(() => {});
          return;
        }
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    try {
      const { handleLfgVoiceJoin, handleLfgVoiceLeave, cleanUpEmptyLfg } = await import("../modules/dungeonLfg.js");

      if (joinedNew) {
        if (newState.channel) {
          await handleVoiceJoin(member, newState.channel);
          await handleLfgVoiceJoin(member, newState.channel);
        }
      } else if (leftOld) {
        if (oldState.channel) await handleVoiceLeave(client, member, oldState.channel);
        if (oldState.channelId) await handleLfgVoiceLeave(client, member, oldState.channelId);
        if (oldState.channelId) await checkLfgChannelCleanup(client, oldState.channelId, cleanUpEmptyLfg);
      } else if (movedBetween) {
        if (oldState.channel) await handleVoiceLeave(client, member, oldState.channel);
        if (oldState.channelId) await handleLfgVoiceLeave(client, member, oldState.channelId);
        
        if (newState.channel) {
          await handleVoiceJoin(member, newState.channel);
          await handleLfgVoiceJoin(member, newState.channel);
        }
        
        if (oldState.channelId) await checkLfgChannelCleanup(client, oldState.channelId, cleanUpEmptyLfg);
      }
    } catch (err) {
      console.error("[VoiceStateUpdate] Error:", err);
    }
  },
};

async function checkLfgChannelCleanup(client, channelId, cleanUpEmptyLfg) {
  try {
    const lfgRes = await query("SELECT id FROM dungeon_lfg_groups WHERE voice_channel_id=$1 AND status != 'expired'", [channelId]);
    if (lfgRes.rows.length > 0) {
      const groupId = lfgRes.rows[0].id;
      await cleanUpEmptyLfg(client, groupId);
    }
  } catch (err) {
    console.error("[VoiceStateUpdate:LFG] Cleanup check error:", err);
  }
}

