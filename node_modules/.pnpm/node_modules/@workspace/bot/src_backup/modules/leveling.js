import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";

const XP_COOLDOWN_MS = 60 * 1000;
const XP_MIN = 15;
const XP_MAX = 40;

function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

export async function handleXp(message) {
  try {
    const userId = message.author.id;
    const guildId = message.guild.id;

    const res = await query(
      "SELECT xp, level, last_xp_at FROM users WHERE user_id = $1 AND guild_id = $2",
      [userId, guildId]
    );

    const now = new Date();
    let user = res.rows[0];

    if (user) {
      const elapsed = now - new Date(user.last_xp_at);
      if (elapsed < XP_COOLDOWN_MS) return;

      const xpGain = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
      let newXp = user.xp + xpGain;
      let newLevel = user.level;

      while (newXp >= xpForLevel(newLevel)) {
        newXp -= xpForLevel(newLevel);
        newLevel++;
        await notifyLevelUp(message, newLevel);
      }

      await query(
        "UPDATE users SET xp = $1, level = $2, total_messages = total_messages + 1, last_xp_at = $3 WHERE user_id = $4 AND guild_id = $5",
        [newXp, newLevel, now, userId, guildId]
      );
    } else {
      await query(
        "INSERT INTO users (user_id, guild_id, xp, level, total_messages, last_xp_at) VALUES ($1,$2,$3,1,1,$4) ON CONFLICT (user_id, guild_id) DO NOTHING",
        [userId, guildId, Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN, now]
      );
    }
  } catch (err) {
    console.error("[Leveling] XP error:", err);
  }
}

async function notifyLevelUp(message, level) {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎉 ترقية مستوى!")
    .setDescription(`مبروك ${message.author} وصلت **المستوى ${level}**!\nاستمر، دعمك يهمنا 🚀`)
    .setTimestamp();
  await message.channel.send({ embeds: [embed] }).catch(() => {});
}

export async function getRank(interaction) {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const res = await query(
    "SELECT xp, level, total_messages FROM users WHERE user_id = $1 AND guild_id = $2",
    [target.id, interaction.guildId]
  );

  if (!res.rows[0]) {
    await interaction.reply({ content: `${target.tag} has no XP yet.`, flags: 64 });
    return;
  }

  const { xp, level, total_messages } = res.rows[0];
  const needed = xpForLevel(level);

  const rankRes = await query(
    "SELECT COUNT(*) AS rank FROM users WHERE guild_id = $1 AND (level > $2 OR (level = $2 AND xp > $3))",
    [interaction.guildId, level, xp]
  );
  const rank = parseInt(rankRes.rows[0].rank) + 1;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Rank Card — ${target.tag}`)
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "Rank", value: `#${rank}`, inline: true },
      { name: "Level", value: `${level}`, inline: true },
      { name: "XP", value: `${xp} / ${needed}`, inline: true },
      { name: "Messages", value: `${total_messages}`, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function getLeaderboard(interaction) {
  const res = await query(
    "SELECT user_id, level, xp FROM users WHERE guild_id = $1 ORDER BY level DESC, xp DESC LIMIT 10",
    [interaction.guildId]
  );

  if (!res.rows.length) {
    await interaction.reply({ content: "No XP data yet.", flags: 64 });
    return;
  }

  const lines = res.rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — Level ${r.level} (${r.xp} XP)`);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("XP Leaderboard")
    .setDescription(lines.join("\n"))
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
