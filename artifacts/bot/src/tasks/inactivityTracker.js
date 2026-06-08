import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";
import { scrapeProfile } from "../modules/scraper.js";

const INACTIVITY_CHANNEL_ID = "1470406771318460426";
const CHECK_INTERVAL_DAYS = 7;

export async function startInactivityTask(client) {
  console.log("[Inactivity] Task scheduled (checks daily for 7-day milestones).");
  
  // Check once on startup, then every 12 hours
  checkAllGuilds(client);
  setInterval(() => checkAllGuilds(client), 12 * 60 * 60 * 1000);
}

async function checkAllGuilds(client) {
  try {
    const guildsRes = await query("SELECT DISTINCT guild_id FROM power_cards");
    for (const row of guildsRes.rows) {
      await processInactivityForGuild(client, row.guild_id);
    }
  } catch (err) {
    console.error("[Inactivity] Main loop error:", err);
  }
}

async function processInactivityForGuild(client, guildId) {
  const isMainGuild = guildId === (process.env.MAIN_GUILD_ID || "861355983975874601");
  const configRes = await query(
    "SELECT log_channel_id, admin_channel_id FROM guild_config WHERE guild_id = $1",
    [guildId]
  );
  const config = configRes.rows[0] || {};
  const channelId = config.log_channel_id || config.admin_channel_id || (isMainGuild ? INACTIVITY_CHANNEL_ID : null);

  if (!channelId) {
    console.warn(`[Inactivity] No logging channel configured for guild ${guildId}.`);
    return;
  }

  const channel = client.channels.cache.get(channelId) || 
                  await client.channels.fetch(channelId).catch(() => null);
  
  if (!channel) {
    console.warn(`[Inactivity] Channel ${channelId} not found.`);
    return;
  }

  // Get users who haven't been checked in 7 days (or never)
  const usersRes = await query(`
    SELECT * FROM power_cards 
    WHERE guild_id = $1 
    AND (last_activity_check IS NULL OR last_activity_check < NOW() - INTERVAL '7 days')
  `, [guildId]);

  if (usersRes.rows.length === 0) return;

  console.log(`[Inactivity] Checking ${usersRes.rows.length} users in guild ${guildId}...`);

  for (const userRow of usersRes.rows) {
    await checkUserProgress(client, guildId, userRow, channel);
    // Delay between scrapes to avoid rate limits
    await new Promise(r => setTimeout(r, 5000));
  }
}

async function checkUserProgress(client, guildId, userRow, logChannel) {
  const { user_id, shugo_url, prev_level, prev_cp, inactivity_streak, character_name, class_name } = userRow;
  
  if (!shugo_url) return;

  const scrapeResult = await scrapeProfile(shugo_url);
  if (!scrapeResult.success) {
    console.error(`[Inactivity] Scrape failed for ${character_name}:`, scrapeResult.error);
    return;
  }

  const newLevel = scrapeResult.data.characterLevel;
  const newCP = scrapeResult.data.combatPower;

  // Logic: Progress if newLevel > prevLevel OR newCP > prevCP
  // Note: if prev_level is null (first check), we set it and treat as active
  let isProgressing = true;
  if (prev_level !== null && prev_cp !== null) {
    isProgressing = (newLevel > prev_level) || (newCP > prev_cp);
  }

  let newStreak = isProgressing ? 0 : (inactivity_streak + 1);

  // Database Update
  await query(`
    UPDATE power_cards 
    SET prev_level = $1, prev_cp = $2, inactivity_streak = $3, last_activity_check = NOW()
    WHERE id = $4
  `, [newLevel, newCP, newStreak, userRow.id]);

  if (isProgressing) {
    // If they were marked as Absent but now moved, we could potentially reset status in recruits
    if (inactivity_streak >= 2) {
      await query("UPDATE recruits SET status='accepted' WHERE guild_id=$1 AND user_id=$2", [guildId, user_id]);
    }
    return;
  }

  // Handle Inactivity
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  const member = guild ? await guild.members.fetch(user_id).catch(() => null) : null;
  const tag = member ? member.user.tag : character_name;

  const embed = new EmbedBuilder()
    .setTitle(newStreak >= 2 ? "🔴 تقرير غياب (Week 2+)" : "⚠️ تنبيه خمول (Week 1)")
    .setColor(newStreak >= 2 ? 0xed4245 : 0xf1c40f)
    .addFields([
      { name: "اللاعب", value: `${tag} (${character_name})`, inline: true },
      { name: "الكلاس", value: class_name || "—", inline: true },
      { name: "الـ CP الحالي", value: newCP?.toLocaleString() || "—", inline: true },
      { name: "الحالة", value: newStreak >= 2 ? "🔴 غائب متكرر" : "⚠️ خامل للأسبوع الأول", inline: false }
    ])
    .setTimestamp();

  await logChannel.send({ embeds: [embed] });

  // Week 1 DM
  if (newStreak === 1 && member) {
    const dmEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("مرحباً بك في قيلد M3RGEEN")
      .setDescription(
        `لاحظنا توقف تقدم شخصيتك (**${character_name}**) في اللعبة مؤخراً.\n\n` +
        "نرجو منك التواصل مع الإدارة لمساعدتك وحل مشكلتك في حال واجهت أي عوائق. نحن هنا لندعمك! 💪"
      );
    await member.send({ embeds: [dmEmbed] }).catch(() => {});
  }

  // Week 2 Status Update
  if (newStreak >= 2) {
    await query("UPDATE recruits SET status='absent' WHERE guild_id=$1 AND user_id=$2", [guildId, user_id]);
  }
}
