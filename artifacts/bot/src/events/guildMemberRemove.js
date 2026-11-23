import { EmbedBuilder, AuditLogEvent } from "discord.js";
import { query } from "../database/index.js";
import { removeMemberAllData } from "../modules/management.js";

export default {
  name: "guildMemberRemove",
  once: false,
  async execute(member, client) {
    await removeMemberAllData(client, member.guild, member.id).catch((e) =>
      console.error("[MemberRemove] Data cleanup error:", e)
    );

    // ── Throne and Liberty Member Count Sync ────────────────────────────────
    if (member.guild.id === "861355983975874601") {
      const TL_MEMBER_ROLE_ID = "1292754458492796982";
      if (member.roles.cache.has(TL_MEMBER_ROLE_ID)) {
        try {
          const { updateTLMemberCount } = await import("../modules/throneliberty.js");
          await updateTLMemberCount(client);
        } catch (err) {
          console.error("[TL] Error triggering count update from guildMemberRemove:", err);
        }
      }
    }

    // ── Guild Wars 2 Member Count Sync ──────────────────────────────────────
    const GW2_ROLE_ID = "1511293343353667656";
    if (member.roles.cache.has(GW2_ROLE_ID)) {
      try {
        const { updateGW2MemberCount } = await import("../modules/guildwars2.js");
        await updateGW2MemberCount(client);
      } catch (err) {
        console.error("[GW2] Error triggering count update from guildMemberRemove:", err);
      }
    }

    try {
      const res = await query(
        "SELECT farewell_channel_id FROM guild_config WHERE guild_id = $1",
        [member.guild.id]
      );
      const config = res.rows[0];
      if (!config?.farewell_channel_id) return;

      const channel = member.guild.channels.cache.get(config.farewell_channel_id);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("A member has left")
        .setDescription(`**${member.user.tag}** has left **${member.guild.name}**.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error("[Farewell] Error sending farewell message:", err);
    }

    // ── Member Leave Watcher System (e.g. OSAJ Oday) ─────────────────────────
    try {
      let watcherRecord = null;
      // 1. Check database
      try {
        const watchRes = await query(
          "SELECT * FROM member_leave_watchers WHERE user_id = $1",
          [member.id]
        );
        if (watchRes.rowCount > 0) {
          watcherRecord = watchRes.rows[0];
        }
      } catch (dbErr) {
        console.error("[Watcher] DB check error:", dbErr);
      }

      // Fallback in-memory safety check
      if (!watcherRecord && member.id === "1112142593107697674") {
        watcherRecord = {
          user_id: "1112142593107697674",
          notify_user_id: "136371223209836544",
          reason: "تحذير شديد اللهجة بسبب مضايقة عضوة"
        };
      }

      if (watcherRecord) {
        const notifyTargetUser = await client.users.fetch(watcherRecord.notify_user_id).catch(() => null);
        if (notifyTargetUser) {
          let leaveType = "خروج ذاتي (غادر السيرفر بنفسه)";
          
          try {
            const auditLogs = await member.guild.fetchAuditLogs({ limit: 5 }).catch(() => null);
            if (auditLogs && auditLogs.entries.size > 0) {
              const now = Date.now();
              for (const entry of auditLogs.entries.values()) {
                if (entry.target?.id === member.id && Math.abs(now - entry.createdTimestamp) < 15000) {
                  if (entry.action === AuditLogEvent.MemberKick) {
                    leaveType = `طرد (Kick) بواسطة: <@${entry.executor.id}> (\`${entry.executor.tag}\`)`;
                    break;
                  } else if (entry.action === AuditLogEvent.MemberBanAdd) {
                    leaveType = `حظر (Ban) بواسطة: <@${entry.executor.id}> (\`${entry.executor.tag}\`)`;
                    break;
                  }
                }
              }
            }
          } catch (auditErr) {
            console.error("[Watcher] Audit log fetch error:", auditErr);
          }

          const unixNow = Math.floor(Date.now() / 1000);
          const joinedUnix = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

          const leaveAlertEmbed = new EmbedBuilder()
            .setColor("#F39C12")
            .setTitle("🚨 إشعار خروج: عضو مراقب غادر السيرفر")
            .setDescription(`العضو المراقب **${member.user.tag}** غادر سيرفر **${member.guild.name}**.`)
            .addFields(
              { name: "👤 العضو", value: `<@${member.user.id}> (\`${member.user.tag}\`)`, inline: true },
              { name: "🆔 آيدي العضو", value: `\`${member.id}\``, inline: true },
              { name: "📋 سبب المراقبة", value: watcherRecord.reason || "مراقبة إدارية", inline: false },
              { name: "🚪 طبيعة الخروج", value: leaveType, inline: false },
              { name: "📅 تاريخ الانضمام السابق", value: joinedUnix ? `<t:${joinedUnix}:F>` : "غير متوفر", inline: true },
              { name: "⏰ وقت الخروج", value: `<t:${unixNow}:F> (<t:${unixNow}:R>)`, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `نظام المراقبة والتنبيهات الإدارية • سيرفر ${member.guild.name}` })
            .setTimestamp();

          await notifyTargetUser.send({
            content: `🔔 **تنبيه إداري عاجل:** العضو **${member.user.tag}** (\`${member.id}\`) غادر السيرفر الآن! (${leaveType})`,
            embeds: [leaveAlertEmbed]
          });

          console.log(`[Watcher] Leave notification successfully sent to ${notifyTargetUser.tag} for user ${member.id}`);

          // Remove from watchers table after notifying
          try {
            await query("DELETE FROM member_leave_watchers WHERE user_id = $1", [member.id]);
          } catch (delErr) {
            console.error("[Watcher] DB delete error:", delErr);
          }
        }
      }
    } catch (watcherTotalErr) {
      console.error("[Watcher] Fatal error in leave watcher:", watcherTotalErr);
    }
  },
};
