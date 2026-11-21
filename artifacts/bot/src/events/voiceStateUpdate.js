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
    try {
      const { handleVoiceStateGate } = await import("../modules/sageVoiceGate.js");
      await handleVoiceStateGate(oldState, newState);
    } catch (gateErr) {
      console.error("[VoiceStateUpdate] Error in handleVoiceStateGate:", gateErr);
    }
    // ───────────────────────────────────────────────────────────────────────

    // ─── M3RGEEN Abyss Voice Security & Spy Alert ─────────────────────────
    try {
      const { handleAbyssVoiceSecurity } = await import("../modules/m3rgeenAbyssVoiceSecurity.js");
      await handleAbyssVoiceSecurity(oldState, newState, client);
    } catch (abyssErr) {
      console.error("[VoiceStateUpdate] Error in handleAbyssVoiceSecurity:", abyssErr);
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
      }
      
      // AION2 Routing
      const { handleAion2VoiceStateUpdate } = await import("../modules/aion2Lfg/handlers/voiceState.js");
      await handleAion2VoiceStateUpdate(oldState, newState);

      // Ludra Static Teams Voice Routing
      try {
        const { handleLudraVoiceStateUpdate } = await import("../modules/ludraStaticTeams.js");
        await handleLudraVoiceStateUpdate(oldState, newState, client);
      } catch (ludraVoiceErr) {
        console.error("[VoiceStateUpdate] Error in handleLudraVoiceStateUpdate:", ludraVoiceErr);
      }

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

