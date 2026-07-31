import { handleVoiceJoin, handleVoiceLeave } from "../tasks/voiceTracker.js";
import { query } from "../database/index.js";
import { handleVoiceJoin as levelingVoiceJoin, handleVoiceLeave as levelingVoiceLeave } from "../modules/leveling.js";

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
          await levelingVoiceJoin(member);
        }
      } else if (leftOld) {
        if (oldState.channel) await handleVoiceLeave(client, member, oldState.channel);
        if (oldState.channelId) await handleLfgVoiceLeave(client, member, oldState.channelId);
        await levelingVoiceLeave(member);
        if (oldState.channelId) await checkLfgChannelCleanup(client, oldState.channelId, cleanUpEmptyLfg);
      } else if (movedBetween) {
        if (oldState.channel) await handleVoiceLeave(client, member, oldState.channel);
        if (oldState.channelId) await handleLfgVoiceLeave(client, member, oldState.channelId);
        
        if (newState.channel) {
          await handleVoiceJoin(member, newState.channel);
          await handleLfgVoiceJoin(member, newState.channel);
        }
        
        if (oldState.channelId) await checkLfgChannelCleanup(client, oldState.channelId, cleanUpEmptyLfg);

        // ─── Mod Tracker Logic for Voice Move ────────────────
        if (newState.guild.id === "861355983975874601") {
           const { AuditLogEvent, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = await import("discord.js");
           const auditLogs = await newState.guild.fetchAuditLogs({ type: AuditLogEvent.MemberMove, limit: 1 }).catch(() => null);
           const log = auditLogs?.entries.first();
           
           // If a MemberMove audit log was created within the last 4 seconds
           if (log && Date.now() - log.createdTimestamp < 4000) {
              const executor = log.executor;
              if (executor && !executor.bot && !executor.system) {
                 const TARGET_ROLE_ID = "1509497629564866680";
                 const executorMember = await newState.guild.members.fetch(executor.id).catch(() => null);
                 
                 if (executorMember && executorMember.roles.cache.has(TARGET_ROLE_ID)) {
                    const LOG_CHANNEL_ID = "1290468734045261885";
                    const logChannel = newState.guild.channels.cache.get(LOG_CHANNEL_ID) || await newState.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
                    
                    if (logChannel) {
                       const embed = new EmbedBuilder()
                          .setColor("#00d0ff")
                          .setAuthor({ name: "تتبع نشاط المشرفين", iconURL: executor.displayAvatarURL() })
                          .setTitle("تحريك عضو (صوتي)")
                          .setDescription(`**المشرف:** <@${executor.id}>\n**اللاعب المستهدف:** <@${member.user.id}>\n**إلى روم:** <#${newState.channelId}>`)
                          .addFields({ name: "السبب المذكور", value: "⏳ بانتظار تحديد المشرف للسبب..." })
                          .setTimestamp()
                          .setFooter({ text: "نظام المراقبة الأمنية 👁️" });

                       const row = new ActionRowBuilder()
                          .addComponents(
                             new StringSelectMenuBuilder()
                                .setCustomId(`mod:move_reason:${executor.id}:${member.user.id}`)
                                .setPlaceholder("اختر سبب التحريك من هنا...")
                                .addOptions([
                                   { label: "طلب من العضو", value: "طلب من العضو", emoji: "🗣️" },
                                   { label: "إزعاج / تشتيت", value: "إزعاج / تشتيت", emoji: "🔇" },
                                   { label: "AFK / خمول", value: "AFK / خمول", emoji: "💤" },
                                   { label: "تنظيم الرومات", value: "تنظيم الرومات", emoji: "🗂️" },
                                   { label: "أخرى (بدون سبب محدد)", value: "أخرى (بدون سبب محدد)", emoji: "🤷" }
                                ])
                          );

                       await logChannel.send({ embeds: [embed], components: [row] }).catch(console.error);
                    }
                 }
              }
           }
        }
        // ──────────────────────────────────────────────────
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

