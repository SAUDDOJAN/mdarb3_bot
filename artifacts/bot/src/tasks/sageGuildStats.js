/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          SAGE GUILD STATS TASK — Daily Roster Board                 ║
 * ║  Guild ID: 1507696012410749030                                      ║
 * ║  Sends one stats card per guild to SAGE_GUILD_STATS_CHANNEL_ID.    ║
 * ║  Runs once on startup then every 24 hours (refreshes existing msgs).║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";

const SAGE_GUILD_ID        = "1507696012410749030";
const GUILD_ROLE_SYMBOL    = "⚔️";

// Channel where the guild stats board lives (roster channel)
const STATS_CHANNEL_ID     = process.env.SAGE_GUILD_STATS_CHANNEL_ID ?? null;

// DB table to persist message IDs so we edit instead of re-posting
const STATS_MSG_TABLE = `
  CREATE TABLE IF NOT EXISTS sage_guild_stat_messages (
    guild_role_id TEXT PRIMARY KEY,
    message_id    TEXT NOT NULL,
    channel_id    TEXT NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const numFmt = (n) => Number(n).toLocaleString("en-US");
const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));

const GRADE_EMOJI = {
  Unique:    "🟣",
  Rare:      "🔵",
  Epic:      "🟡",
  Legend:    "🟠",
  Legendary: "🟠",
};

// ─── Startup ─────────────────────────────────────────────────────────────────
export async function startSageGuildStatsTask(client) {
  if (!STATS_CHANNEL_ID) {
    console.warn("[GuildStats] SAGE_GUILD_STATS_CHANNEL_ID not set — task disabled.");
    return;
  }

  // Ensure the message-tracking table exists
  await query(STATS_MSG_TABLE).catch((e) =>
    console.error("[GuildStats] Failed to create tracking table:", e.message)
  );

  console.log("[GuildStats] Sage guild stats task started (daily refresh).");

  // Run immediately on startup, then every 1 h
  await runGuildStatsUpdate(client);
  setInterval(() => runGuildStatsUpdate(client), 1 * 60 * 60 * 1000);
}

// ─── Main update loop ─────────────────────────────────────────────────────────
async function runGuildStatsUpdate(client) {
  try {
    const guild = client.guilds.cache.get(SAGE_GUILD_ID)
      ?? await client.guilds.fetch(SAGE_GUILD_ID).catch(() => null);

    if (!guild) {
      console.warn("[GuildStats] Sage guild not found.");
      return;
    }

    const channel = guild.channels.cache.get(STATS_CHANNEL_ID)
      ?? await client.channels.fetch(STATS_CHANNEL_ID).catch(() => null);

    if (!channel) {
      console.warn(`[GuildStats] Stats channel ${STATS_CHANNEL_ID} not found.`);
      return;
    }

    // 1. Update/Post the Master Alliance Overview Card first (always stays at top)
    try {
      await updateAllianceMasterCard(guild, channel);
      await sleep(600);
    } catch (masterErr) {
      console.error("[GuildStats] Error updating master card:", masterErr.message);
    }

    // 2. Fetch all individual guild roles (roles containing ⚔️, excluding the base Alliance Member role)
    await guild.roles.fetch();
    const ALLIANCE_MEMBER_ROLE_ID = "1571516616435302410";
    const guildRoles = guild.roles.cache.filter((r) =>
      r.name.includes(GUILD_ROLE_SYMBOL) &&
      r.id !== ALLIANCE_MEMBER_ROLE_ID &&
      !r.name.includes("Alliance Member") &&
      !r.name.includes("عضو التحالف")
    );

    if (guildRoles.size === 0) {
      console.warn("[GuildStats] No individual guild roles found.");
      return;
    }

    // Fetch all members so we can count role members accurately
    await guild.members.fetch();

    console.log(`[GuildStats] Refreshing stats for ${guildRoles.size} individual guild(s)...`);

    for (const [roleId, role] of guildRoles) {
      try {
        await updateGuildStatCard(guild, channel, roleId, role);
        await sleep(600); // throttle between guilds
      } catch (err) {
        console.error(`[GuildStats] Error updating card for role ${role.name}:`, err.message);
      }
    }

    console.log("[GuildStats] ✅ All guild stats updated.");
  } catch (err) {
    console.error("[GuildStats] Unexpected error in runGuildStatsUpdate:", err);
  }
}

// ─── Master Alliance Overview Card ───────────────────────────────────────────
export async function updateAllianceMasterCard(guild, channel = null) {
  const MASTER_KEY = "MASTER_ALLIANCE_CARD";
  const LEADER_USER_ID = "136371223209836544";
  const ALLIANCE_CHANNEL_ID = "1571561801433358406"; // 👑┊الحلف

  const targetChannel = guild.channels.cache.get(ALLIANCE_CHANNEL_ID)
    ?? await guild.channels.fetch(ALLIANCE_CHANNEL_ID).catch(() => null)
    ?? channel;

  if (!targetChannel) {
    console.warn(`[GuildStats] Alliance channel ${ALLIANCE_CHANNEL_ID} not found.`);
    return;
  }

  // Query overall accepted members and stats
  const totalAcceptedRes = await query("SELECT COUNT(*) AS cnt, COALESCE(SUM(combat_power), 0) AS total_cp FROM sage_recruitment WHERE status = 'accepted'");
  const totalMembers = parseInt(totalAcceptedRes.rows[0]?.cnt ?? 0, 10);
  const totalCp = parseInt(totalAcceptedRes.rows[0]?.total_cp ?? 0, 10);

  const todayRes = await query(
    `SELECT COUNT(*) AS cnt FROM sage_recruitment 
     WHERE status = 'accepted' 
       AND joined_at >= NOW() AT TIME ZONE 'Asia/Riyadh' - INTERVAL '1 day'`
  );
  const addedToday = parseInt(todayRes.rows[0]?.cnt ?? 0, 10);

  // Distinct guilds count
  const guildsCountRes = await query(
    `SELECT COUNT(DISTINCT guild_name) AS cnt FROM sage_recruitment 
     WHERE status = 'accepted' AND guild_name IS NOT NULL AND guild_name != 'Solo Player' AND guild_name NOT LIKE '%لاعب فردي%'`
  );
  const totalGuilds = parseInt(guildsCountRes.rows[0]?.cnt ?? 0, 10);

  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric" });

  const embed = new EmbedBuilder()
    .setColor(0xd4af37) // Gold
    .setTitle("👑 إحصائيات تحالف الحصارات الشاملة | Alliance Overview")
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setDescription(
      `🏰 **سيرفر الديسكورد:** ${guild.name}\n` +
      `⚔️ **إجمالي مقاتلي التحالف (Alliance Member):** **${totalMembers}** مقاتل معتمد\n` +
      `🛡️ **عدد القيلدات المتحالفة:** **${totalGuilds}** قيلد\n` +
      `⚡ **إجمالي قوة قتال التحالف (Total CP):** ★ **${numFmt(totalCp)}** ★\n` +
      `✅ **انضموا اليوم:** **${addedToday}** عضو جديد\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👑 **القيادة العليا للتحالف:** <@${LEADER_USER_ID}>\n` +
      `🏰 **القيلدات المتحالفة:** يمكنكم استعراض بطاقات وإحصائيات القيلدات في روم <#1507703833223233567>.`
    )
    .setFooter({ text: `تحالف الحصارات • التقرير الشامل • ${dateStr}` })
    .setTimestamp();

  const existingRes = await query(
    "SELECT message_id FROM sage_guild_stat_messages WHERE guild_role_id = $1",
    [MASTER_KEY]
  );
  const existingMsgId = existingRes.rows[0]?.message_id ?? null;

  if (existingMsgId) {
    const existingMsg = await targetChannel.messages.fetch(existingMsgId).catch(() => null);
    if (existingMsg) {
      await existingMsg.edit({ embeds: [embed] });
      await query("UPDATE sage_guild_stat_messages SET updated_at=NOW() WHERE guild_role_id=$1", [MASTER_KEY]);
      console.log("[GuildStats] Updated Master Alliance Overview Card in #الحلف");
      return;
    }
  }

  const msg = await targetChannel.send({ embeds: [embed] });
  await query(
    `INSERT INTO sage_guild_stat_messages (guild_role_id, message_id, channel_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (guild_role_id) DO UPDATE
       SET message_id=$2, channel_id=$3, updated_at=NOW()`,
    [MASTER_KEY, msg.id, targetChannel.id]
  );
  console.log("[GuildStats] Posted new Master Alliance Overview Card in #الحلف");
}

// ─── Per-guild card update ────────────────────────────────────────────────────
export async function updateGuildStatCard(guild, channel, roleId, role) {
  const guildName = role.name.replace(GUILD_ROLE_SYMBOL, "").trim();

  // ── 1. Count total accepted members from database ─────────────────────────
  const totalRes = await query(
    "SELECT COUNT(*) AS cnt FROM sage_recruitment WHERE guild_role_id = $1 AND status = 'accepted'",
    [roleId]
  );
  const totalMembers = parseInt(totalRes.rows[0]?.cnt ?? 0, 10);

  // ── 2. Count members added today (joined_at = today KSA) ───────────────────
  const todayRes = await query(
    `SELECT COUNT(*) AS cnt
     FROM sage_recruitment
     WHERE guild_role_id = $1
       AND status = 'accepted'
       AND joined_at >= NOW() AT TIME ZONE 'Asia/Riyadh' - INTERVAL '1 day'`,
    [roleId]
  );
  const addedToday = parseInt(todayRes.rows[0]?.cnt ?? 0, 10);

  // ── 3. Find guild leader / representative from DB ───────────────────────────
  // We treat the first accepted member (by joined_at) as the representative.
  // They carry the Aion server name and character info.
  const leaderRes = await query(
    `SELECT character_name, class_name, server_name, combat_power, profile_image, shugo_url, source_discord_server
     FROM sage_recruitment
     WHERE guild_role_id = $1 AND status = 'accepted'
     ORDER BY joined_at ASC
     LIMIT 1`,
    [roleId]
  );
  const leader = leaderRes.rows[0] ?? null;

  // ── 4. Build embed ──────────────────────────────────────────────────────────
  const embed = buildGuildStatsEmbed({
    guild,
    guildName,
    totalMembers,
    addedToday,
    leader,
  });

  // ── 5. Post or edit existing message ───────────────────────────────────────
  const existingRes = await query(
    "SELECT message_id FROM sage_guild_stat_messages WHERE guild_role_id = $1",
    [roleId]
  );
  const existingMsgId = existingRes.rows[0]?.message_id ?? null;

  if (existingMsgId) {
    // Try to edit existing message
    const existingMsg = await channel.messages.fetch(existingMsgId).catch(() => null);
    if (existingMsg) {
      await existingMsg.edit({ embeds: [embed] });
      await query(
        "UPDATE sage_guild_stat_messages SET updated_at=NOW() WHERE guild_role_id=$1",
        [roleId]
      );
      console.log(`[GuildStats] Updated card for ${guildName}`);
      return;
    }
  }

  // Post new message
  const msg = await channel.send({ embeds: [embed] });
  await query(
    `INSERT INTO sage_guild_stat_messages (guild_role_id, message_id, channel_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (guild_role_id) DO UPDATE
       SET message_id=$2, channel_id=$3, updated_at=NOW()`,
    [roleId, msg.id, channel.id]
  );
  console.log(`[GuildStats] Posted new card for ${guildName}`);
}

// ─── Embed builder ────────────────────────────────────────────────────────────
function buildGuildStatsEmbed({ guild, guildName, totalMembers, addedToday, leader }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric" });

  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`⚔️ إحصائيات القيلد: ${guildName}`)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setFooter({ text: `تحالف الحصارات • آخر تحديث: ${dateStr}` })
    .setTimestamp();

  const sourceServer = leader?.source_discord_server ?? guild.name;
  const addedText = addedToday > 0 ? `**${addedToday}**` : "0";

  if (leader) {
    const cpDisplay = leader.combat_power > 0 ? numFmt(leader.combat_power) : "—";
    embed.setDescription(
      `🏰 **سيرفر الديسكورد:** ${sourceServer}\n` +
      `👥 **عدد الأعضاء:** **${totalMembers}**\n` +
      `✅ **انضموا اليوم:** ${addedText}\n\n` +
      `> 👑 **قائد القيلد:** ${leader.character_name ?? "—"}\n` +
      `> 🎮 **التخصص:** ${leader.class_name ?? "—"}\n` +
      `> 🌍 **سيرفر اللعبة:** ${leader.server_name ?? "—"}\n` +
      `> ⚡ **قوة القتال (CP):** ★ ${cpDisplay} ★\n\n` +
      (leader.shugo_url ? `🔗 **[عرض البروفايل على Shugo.gg](${leader.shugo_url})**` : "")
    );
    if (leader.profile_image) embed.setThumbnail(leader.profile_image);
  } else {
    embed.setDescription(
      `🏰 **سيرفر الديسكورد:** ${sourceServer}\n` +
      `👥 **عدد الأعضاء:** **${totalMembers}**\n` +
      `✅ **انضموا اليوم:** ${addedText}\n\n` +
      `*لا يوجد أعضاء مسجلون حتى الآن.*`
    );
  }

  return embed;
}
