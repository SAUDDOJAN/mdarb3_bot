import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";

export const M3RGEEN_GUILD_ID = "861355983975874601";
export const ABYSS_VOICE_CHANNEL_ID = "1558947326704226424"; // 🌌｜أبيس
export const M3RGEEN_GUILD_ROLE_ID = "1555617080521269368"; // M3RGEEN Guild
export const ALERT_TARGET_USER_ID = "136371223209836544"; // Leader Discord ID (c.nn / Saud)

// 30-minute cooldown per member to prevent spam on reconnects
const alertCooldown = new Map();

/**
 * Handles voice security monitoring for the Abyss voice channel.
 * Triggers a DM alert if a member with 'M3RGEEN Guild' role enters and was registered
 * within the last 14 days (two weeks) or has no registration in the database.
 */
export async function handleAbyssVoiceSecurity(oldState, newState, client) {
  try {
    if (newState.guild?.id !== M3RGEEN_GUILD_ID) return;
    if (newState.channelId !== ABYSS_VOICE_CHANNEL_ID) return;

    // Check if user just joined or moved into this channel
    if (oldState.channelId === ABYSS_VOICE_CHANNEL_ID) return;

    const member = newState.member;
    if (!member || member.user.bot) return;

    // Don't alert for the leader himself
    if (member.id === ALERT_TARGET_USER_ID) return;

    // Check if member holds the official M3RGEEN Guild role
    if (!member.roles.cache.has(M3RGEEN_GUILD_ROLE_ID)) {
      console.log(`[AbyssSecurity] Member ${member.user.tag} joined without M3RGEEN Guild role.`);
      return;
    }

    // Cooldown check (30 minutes)
    const now = Date.now();
    const lastAlert = alertCooldown.get(member.id);
    if (lastAlert && now - lastAlert < 30 * 60 * 1000) {
      console.log(`[AbyssSecurity] Alert cooldown active for ${member.user.tag} (${Math.round((now - lastAlert) / 1000)}s ago).`);
      return;
    }

    // Query registration details
    const res = await query(
      `SELECT * FROM aion2_global_applications 
       WHERE discord_id = $1 
       ORDER BY created_at DESC LIMIT 1`,
      [member.id]
    ).catch((err) => {
      console.error("[AbyssSecurity] DB query error:", err);
      return null;
    });

    const app = res?.rows?.[0] || null;

    let isSuspicious = false;
    let reasonText = "";
    let regDate = null;
    let daysAgo = 0;

    if (!app) {
      // No registration record in DB!
      isSuspicious = true;
      reasonText = "⚠️ غير مسجل بالنظام (لا يوجد له طلب تقديم مسجل في قاعدة البيانات)";
    } else {
      regDate = new Date(app.created_at || app.reviewed_at || app.updated_at);
      const diffMs = now - regDate.getTime();
      daysAgo = diffMs / (1000 * 60 * 60 * 24);

      // Condition: registered within the last 14 days (two weeks)
      if (daysAgo <= 14) {
        isSuspicious = true;
        reasonText = `⚠️ مسجل حديثاً منذ ${Math.floor(daysAgo)} يوم و ${Math.floor((daysAgo % 1) * 24)} ساعة (أقل من أسبوعين)`;
      }
    }

    if (!isSuspicious) {
      console.log(`[AbyssSecurity] Member ${member.user.tag} is a verified veteran (${Math.floor(daysAgo)} days). No alert needed.`);
      return;
    }

    // Mark cooldown
    alertCooldown.set(member.id, now);

    console.log(`[AbyssSecurity] 🚨 Potential spy detected: ${member.user.tag} (${reasonText}). Sending DM to leader...`);

    const leaderUser = await client.users.fetch(ALERT_TARGET_USER_ID).catch(() => null);
    if (!leaderUser) {
      console.error(`[AbyssSecurity] Could not fetch leader user ${ALERT_TARGET_USER_ID}`);
      return;
    }

    const charName = app?.character_name || "غير محدد";
    const className = app?.selected_class || app?.character_data?.className || "غير محدد";
    const charLevel = app?.character_level || (app?.character_data?.characterLevel ?? "؟");
    const cp = app?.combat_power ? Number(app.combat_power).toLocaleString() : (app?.character_data?.combatPower ? Number(app.character_data.combatPower).toLocaleString() : "غير محدد");
    const serverName = app?.server_name || "Ludra";
    const raceName = app?.race_name || "Asmodians";
    const shugoUrl = app?.shugo_url || (app?.character_name ? `https://shugo.gg/character/global/eu-ludra/${encodeURIComponent(app.character_name)}` : null);

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c) // Red warning
      .setTitle("⚠️ تحذير: احتمال تجسس في روم أبيس الصوتي")
      .setDescription(
        `رصد النظام دخول لاعب يحمل رتبة **M3RGEEN Guild** وهو **مسجل حديثاً أو غير موثق** إلى روم **🌌｜أبيس**:\n\n` +
        `**الحالة:** ${reasonText}`
      )
      .addFields(
        {
          name: "👤 اللاعب في الديسكورد",
          value: `${member.user.tag} (<@${member.id}>)\nID: \`${member.id}\``,
          inline: true,
        },
        {
          name: "📅 الانضمام للسيرفر",
          value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "غير معروف",
          inline: true,
        },
        {
          name: "⚔️ شخصية اللعبة",
          value: `**${charName}**\n${className} (Lv. ${charLevel})`,
          inline: true,
        },
        {
          name: "⚡ الـ Combat Power",
          value: `\`${cp}\``,
          inline: true,
        },
        {
          name: "🌍 السيرفر والفاكشن",
          value: `${serverName} • ${raceName}`,
          inline: true,
        },
        {
          name: "⏱️ تاريخ التسجيل في البوت",
          value: regDate ? `<t:${Math.floor(regDate.getTime() / 1000)}:f>\n(<t:${Math.floor(regDate.getTime() / 1000)}:R>)` : "❌ غير مسجل",
          inline: true,
        }
      );

    if (shugoUrl) {
      embed.addFields({
        name: "🔗 رابط Shugo.gg",
        value: `[استعراض بيانات الشخصية والعتاد](${shugoUrl})`,
        inline: false,
      });
    }

    if (app?.profile_image) {
      embed.setThumbnail(app.profile_image);
    } else if (member.displayAvatarURL) {
      embed.setThumbnail(member.displayAvatarURL());
    }

    embed
      .setFooter({ text: "نظام أمن وحماية رومات العمليات • M3RGEEN Guard" })
      .setTimestamp();

    await leaderUser.send({ embeds: [embed] }).catch((dmErr) => {
      console.error(`[AbyssSecurity] Failed to send DM to leader:`, dmErr.message);
    });

    console.log(`[AbyssSecurity] DM successfully sent to leader for member ${member.user.tag}`);
  } catch (err) {
    console.error("[AbyssSecurity] Error handling voice security:", err);
  }
}
