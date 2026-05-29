import { EmbedBuilder } from "discord.js";
import { scrapeProfile } from "./scraper.js";
import { query } from "../database/index.js";

// Publicly accessible fallback icon (confirmed 200 PNG from playnccdn CDN)
const FALLBACK_ICON = "https://assets.playnccdn.com/static-aion2/characters/img/info/profile_power_icon_pc.png";

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function buildProgressBar(current, max, length = 18) {
  const pct    = Math.min(Math.max(current / max, 0), 1);
  const filled = Math.round(pct * length);
  const empty  = length - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)}`;
}

// ─── Embed Builder ────────────────────────────────────────────────────────────

// ─── Shared formatting helpers (local copies — no cross-module import) ────────
const _padR   = (s, n) => String(s ?? "").padEnd(n);
const _numFmt = (n)    => Number(n).toLocaleString("en-US");
const _SEP    = "│";
function _fmtBlock(rows) {
  const colW  = Math.max(...rows.map(([l]) => l.length)) + 1;
  const lines = rows.map(([label, value]) => `  ${_padR(label, colW)} ${_SEP}  ${value}`);
  return "```\n" + lines.join("\n") + "\n```";
}

/**
 * Fetches CP growth for 24h, 7d, and 30d.
 */
async function getCPGrowth(userId, currentCP) {
  const intervals = [
    { key: "growth24h", interval: "24 hours" },
    { key: "growth7d",  interval: "7 days" },
    { key: "growth30d", interval: "30 days" },
  ];

  const results = { growth24h: 0, growth7d: 0, growth30d: 0 };

  for (const { key, interval } of intervals) {
    const res = await query(
      `SELECT combat_power FROM power_history 
       WHERE user_id = $1 AND recorded_at <= NOW() - INTERVAL '${interval}' 
       ORDER BY recorded_at DESC LIMIT 1`,
      [userId]
    );
    if (res.rows.length > 0) {
      results[key] = currentCP - res.rows[0].combat_power;
    }
  }

  return results;
}

function buildCardEmbed(data, userId, lastUpdated) {
  const cp        = data.combat_power ?? 0;
  const cpDisplay = cp > 0 ? _numFmt(cp) : "—";
  const level     = data.character_level ?? 0;
  const bar       = buildProgressBar(level, 65);
  const updatedTs = lastUpdated
    ? `<t:${Math.floor(new Date(lastUpdated).getTime() / 1000)}:R>`
    : "الآن";
  const thumbnail = data.profile_image || FALLBACK_ICON;

  // ── Identity block in description ──────────────────────────────────────────
  const identityBlock = _fmtBlock([
    ["الشخصية", data.character_name ?? "—"],
    ["الفئة",   data.class_name     ?? "—"],
    ["الجنس",   data.race_name      ?? "—"],
    ["السيرفر", data.server_name    ?? "—"],
  ]);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`⚔️  ${data.character_name ?? "Unknown"}`)
    .setDescription(
      `> 🏰 **فيلق M3RGEEN** — بطاقة اللاعب\n` +
      `> 🆔 <@${userId}>\n\n` +
      identityBlock
    )
    .setThumbnail(thumbnail)
    .addFields(
      // Level progress bar
      {
        name:   "📊  المستوى",
        value:  `**Lv. ${level}** / 65\n\`${bar}\``,
        inline: false,
      },
      // CP — prominent
      {
        name:   "┄┄┄┄┄┄┄┄ 💪  قوة القتال ┄┄┄┄┄┄┄┄",
        value:  `\`\`\`\n         ★  ${cpDisplay}  ★\n\`\`\``,
        inline: false,
      },
    );

  // ── Growth block ──────────────────────────────────────────────────────────
  if (data.growth) {
    const { growth24h, growth7d, growth30d } = data.growth;
    
    const growthRows = [
      { label: "الزيادة (24 ساعة)", val: growth24h },
      { label: "الزيادة (7 أيام)",  val: growth7d },
      { label: "الزيادة (30 يوم)",  val: growth30d },
    ];
    
    const colW  = Math.max(...growthRows.map((r) => r.label.length)) + 1;
    const lines = growthRows.map(({label, val}) => {
      let colorPrefix = "";
      let colorSuffix = "";
      if (val > 0) {
        colorPrefix = "\x1b[1;32m"; // Bold Green
        colorSuffix = "\x1b[0m";
      } else if (val < 0) {
        colorPrefix = "\x1b[1;33m"; // Bold Yellow/Orange
        colorSuffix = "\x1b[0m";
      }
      
      const valStr = val > 0 ? `\u200E+${_numFmt(val)}` : val < 0 ? `\u200E${_numFmt(val)}` : "—";
      return `${colorPrefix}  ${_padR(label, colW)} ${_SEP}  ${valStr}${colorSuffix}`;
    });
    
    const growthBlock = "```ansi\n" + lines.join("\n") + "\n```";

    embed.addFields({
      name:  "📈  تطور القوة",
      value: growthBlock,
      inline: false,
    });
  }


  // ── Footer meta ───────────────────────────────────────────────────────────
  embed.addFields({
    name:   "🔄  آخر تحديث",
    value:  updatedTs,
    inline: false,
  });

  embed
    .setFooter({ text: "يتم تحديث البطاقة كل 24 ساعة  •  M3RGEEN Power Radar" })
    .setTimestamp();

  return embed;
}

// ─── Resolve Target Channel ───────────────────────────────────────────────────

async function resolveChannel(client, guildId, overrideChannelId) {
  if (overrideChannelId) {
    let ch = client.channels.cache.get(overrideChannelId);
    if (!ch) {
      ch = await client.channels.fetch(overrideChannelId).catch(() => null);
    }
    if (ch) return ch;
  }
  const res = await query(
    "SELECT powercard_channel_id FROM guild_config WHERE guild_id=$1",
    [guildId]
  );
  const channelId = res.rows[0]?.powercard_channel_id;
  if (!channelId) return null;
  let ch = client.channels.cache.get(channelId);
  if (!ch) {
    ch = await client.channels.fetch(channelId).catch(() => null);
  }
  return ch ?? null;
}

// ─── Resolve Discord Member Avatar ───────────────────────────────────────────

async function resolveMemberAvatar(client, guildId, userId) {
  try {
    const guild  = client.guilds.cache.get(guildId);
    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
    if (member) {
      return member.displayAvatarURL({ extension: "png", size: 256 });
    }
    // Fallback: fetch the user object (works even if member left the server)
    const user = await client.users.fetch(userId).catch(() => null);
    return user?.displayAvatarURL({ extension: "png", size: 256 }) ?? FALLBACK_ICON;
  } catch {
    return FALLBACK_ICON;
  }
}

// ─── Create or Update Card ────────────────────────────────────────────────────

/**
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {string} userId
 * @param {string} shugoUrl
 * @param {string} [overrideChannelId]
 */
export async function createOrUpdateCard(client, guildId, userId, shugoUrl, overrideChannelId) {
  const scrapeResult = await scrapeProfile(shugoUrl);
  if (!scrapeResult.success) {
    console.warn(`[PowerCards] Scrape failed for user ${userId}: ${scrapeResult.error}`);
    return false;
  }

  const {
    characterName, characterLevel, className, raceName,
    combatPower, serverName, region, abyss,
  } = scrapeResult.data;

  // Fetch the member's Discord avatar — this is what Discord can always load
  const profileImage = await resolveMemberAvatar(client, guildId, userId);

  // Persist card data (including abyss fields)
  await query(
    `INSERT INTO power_cards
       (guild_id, user_id, character_name, character_level, class_name,
        combat_power, shugo_url, profile_image, abyss_rank, abyss_score, last_updated)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET character_name=$3, character_level=$4, class_name=$5,
           combat_power=$6, shugo_url=$7, profile_image=$8,
           abyss_rank=$9, abyss_score=$10, last_updated=NOW()`,
    [
      guildId, userId, characterName, characterLevel, className,
      combatPower, shugoUrl, profileImage,
      abyss?.rankName ?? null,
      abyss?.score    ?? 0,
    ]
  );

  const channel = await resolveChannel(client, guildId, overrideChannelId);
  if (!channel) {
    console.warn(`[PowerCards] No channel found for guild ${guildId} — card data saved, embed skipped.`);
    return true;
  }

  // Record history
  if (combatPower > 0) {
    await query(
      "INSERT INTO power_history (user_id, combat_power) VALUES ($1, $2)",
      [userId, combatPower]
    );
  }

  const growth = await getCPGrowth(userId, combatPower);

  const cardData = {
    character_name:  characterName,
    character_level: characterLevel,
    class_name:      className,
    race_name:       raceName,
    combat_power:    combatPower,
    server_name:     serverName,
    profile_image:   profileImage,
    abyss_rank:      abyss?.rankName ?? null,
    abyss_score:     abyss?.score    ?? 0,
    growth,
  };
  const embed = buildCardEmbed(cardData, userId, new Date());

  // Try to edit the existing message first
  const existing = await query(
    "SELECT message_id, channel_id FROM power_cards WHERE user_id=$1 AND guild_id=$2",
    [userId, guildId]
  );
  const existingMsgId    = existing.rows[0]?.message_id;
  const existingChanId   = existing.rows[0]?.channel_id;

  if (existingMsgId) {
    let msgChannel = null;
    if (existingChanId) {
      msgChannel = client.channels.cache.get(existingChanId);
      if (!msgChannel) {
        msgChannel = await client.channels.fetch(existingChanId).catch(() => null);
      }
    }
    if (!msgChannel) msgChannel = channel;

    if (msgChannel) {
      const oldMsg = await msgChannel.messages.fetch(existingMsgId).catch(() => null);
      if (oldMsg) {
        await oldMsg.edit({ embeds: [embed] }).catch(() => {});
        console.log(`[PowerCards] Updated card for user ${userId}`);
        return true;
      }
    }
  }

  // Post as new message
  const msg = await channel.send({ embeds: [embed] });
  await query(
    "UPDATE power_cards SET message_id=$1, channel_id=$2 WHERE user_id=$3 AND guild_id=$4",
    [msg.id, channel.id, userId, guildId]
  );
  console.log(`[PowerCards] Posted new card for user ${userId} in #${channel.name}`);
  return true;
}

// ─── Delete Card ──────────────────────────────────────────────────────────────

export async function deleteCard(client, guildId, userId) {
  const res = await query(
    "SELECT message_id, channel_id FROM power_cards WHERE user_id=$1 AND guild_id=$2",
    [userId, guildId]
  );
  const card = res.rows[0];
  if (card?.message_id && card?.channel_id) {
    const ch = client.channels.cache.get(card.channel_id);
    if (ch) {
      const msg = await ch.messages.fetch(card.message_id).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    }
  }
  await query("DELETE FROM power_cards WHERE user_id=$1 AND guild_id=$2", [userId, guildId]);
  console.log(`[PowerCards] Deleted card for user ${userId}`);
}

// ─── Refresh All Cards (24h sync) ────────────────────────────────────────────

export async function refreshAllCards(client) {
  console.log("[PowerCards] Starting check for overdue power cards...");
  const res = await query(
    `SELECT guild_id, user_id, shugo_url, channel_id 
     FROM power_cards 
     WHERE shugo_url IS NOT NULL 
       AND (last_updated IS NULL OR last_updated <= NOW() - INTERVAL '24 hours')`
  );

  if (res.rows.length === 0) {
    console.log("[PowerCards] No overdue cards to refresh.");
    return;
  }

  console.log(`[PowerCards] Found ${res.rows.length} card(s) that need refreshing.`);
  let success = 0, failed = 0;
  for (const row of res.rows) {
    const ok = await createOrUpdateCard(client, row.guild_id, row.user_id, row.shugo_url, row.channel_id);
    ok ? success++ : failed++;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`[PowerCards] Refresh complete — ${success} updated, ${failed} failed.`);
}
