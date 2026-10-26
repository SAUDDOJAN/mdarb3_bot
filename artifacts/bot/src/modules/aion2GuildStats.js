import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";

export const GUILD_STATS_CHANNEL_ID = "1555974899883974848";
export const BOT_STATE_KEY = "aion2_guild_stats_panels";

export const ALL_CLASSES = [
  "Gladiator",
  "Templar",
  "Cleric",
  "Chanter",
  "Ranger",
  "Assassin",
  "Sorcerer",
  "Spiritmaster"
];

export const CLASS_EMOJIS = {
  Gladiator:    "<:Gladiator:1504471947831017532>",
  Templar:      "<:Templar:1504472027724255414>",
  Cleric:       "<:Cleric:1504471892755611678>",
  Chanter:      "<:Chanter:1504471867141128272>",
  Ranger:       "<:Ranger:1504471982006341783>",
  Assassin:     "<:Assassin:1504471833695748156>",
  Sorcerer:     "<:Sorcerer:1504472006610124961>",
  Spiritmaster: "<:Elementalist:1504471920219783209>"
};

export async function getGuildStatsPanelConfig() {
  try {
    const res = await query(`SELECT value FROM bot_state WHERE key = $1`, [BOT_STATE_KEY]);
    if (res.rowCount === 0) return null;
    const val = res.rows[0].value;
    return typeof val === "string" ? JSON.parse(val) : val;
  } catch (err) {
    console.error("[Aion2GuildStats] Error reading config from bot_state:", err);
    return null;
  }
}

export async function saveGuildStatsPanelConfig(config) {
  try {
    await query(`
      INSERT INTO bot_state (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = $2
    `, [BOT_STATE_KEY, JSON.stringify(config)]);
  } catch (err) {
    console.error("[Aion2GuildStats] Error saving config to bot_state:", err);
    throw err;
  }
}

export async function getGuildStatsData(guildKey) {
  const membersRes = await query(`
    SELECT COUNT(*)::int AS count
    FROM aion2_global_applications
    WHERE status = 'ACCEPTED' AND assigned_guild = $1
  `, [guildKey]);
  const memberCount = membersRes.rows[0]?.count || 0;

  const pendingRes = await query(`
    SELECT COUNT(*)::int AS count
    FROM aion2_global_applications
    WHERE status = 'ACCEPTED' AND guild_app_target = $1 AND guild_app_status = 'PENDING'
  `, [guildKey]);
  const pendingCount = pendingRes.rows[0]?.count || 0;

  const classRes = await query(`
    SELECT selected_class, COUNT(*)::int AS count
    FROM aion2_global_applications
    WHERE status = 'ACCEPTED' AND assigned_guild = $1 AND selected_class IS NOT NULL
    GROUP BY selected_class
  `, [guildKey]);

  const classCounts = {};
  for (const c of ALL_CLASSES) {
    classCounts[c] = 0;
  }

  for (const row of classRes.rows) {
    if (row.selected_class) {
      const raw = row.selected_class.trim();
      const matched = ALL_CLASSES.find(c => c.toLowerCase() === raw.toLowerCase());
      const key = matched || raw;
      classCounts[key] = (classCounts[key] || 0) + row.count;
    }
  }

  return {
    memberCount,
    pendingCount,
    classCounts
  };
}

function formatClassDistribution(classCounts) {
  const lines = [
    `${CLASS_EMOJIS.Gladiator} **Gladiator:** \`${classCounts.Gladiator || 0}\`  •  ${CLASS_EMOJIS.Templar} **Templar:** \`${classCounts.Templar || 0}\``,
    `${CLASS_EMOJIS.Cleric} **Cleric:** \`${classCounts.Cleric || 0}\`  •  ${CLASS_EMOJIS.Chanter} **Chanter:** \`${classCounts.Chanter || 0}\``,
    `${CLASS_EMOJIS.Ranger} **Ranger:** \`${classCounts.Ranger || 0}\`  •  ${CLASS_EMOJIS.Assassin} **Assassin:** \`${classCounts.Assassin || 0}\``,
    `${CLASS_EMOJIS.Sorcerer} **Sorcerer:** \`${classCounts.Sorcerer || 0}\`  •  ${CLASS_EMOJIS.Spiritmaster} **Spiritmaster:** \`${classCounts.Spiritmaster || 0}\``
  ];
  return lines.join("\n");
}

export async function buildM3rgeenStatsEmbed() {
  const data = await getGuildStatsData("M3RGEEN_GLOBAL");
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🪽 إحصائيات جيلد M3RGEEN")
    .setDescription(
      `> 🪽 **لوحة الإحصائيات الرسمية لجيلد M3RGEEN في AION 2**\n\n` +
      `🌍 **المسار:** قلوبال\n` +
      `👥 **عدد الأعضاء:** \`${data.memberCount}\`\n` +
      `⏳ **طلبات الانضمام المعلقة:** \`${data.pendingCount}\``
    )
    .addFields(
      { name: "📊 توزيع الكلاسات", value: formatClassDistribution(data.classCounts), inline: false }
    )
    .setFooter({ text: "تحالف M3RGEEN • تحديث تلقائي" })
    .setTimestamp();
}

export async function buildEmperorStatsEmbed() {
  const data = await getGuildStatsData("EMPEROR");
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("👑 إحصائيات جيلد Emperor")
    .setDescription(
      `> 👑 **لوحة الإحصائيات الرسمية لجيلد Emperor في AION 2**\n\n` +
      `⚡ **المسار:** إيرلي أكسس\n` +
      `👥 **عدد الأعضاء:** \`${data.memberCount}\`\n` +
      `⏳ **طلبات الانضمام المعلقة:** \`${data.pendingCount}\``
    )
    .addFields(
      { name: "📊 توزيع الكلاسات", value: formatClassDistribution(data.classCounts), inline: false }
    )
    .setFooter({ text: "تحالف M3RGEEN • تحديث تلقائي" })
    .setTimestamp();
}

export async function setupAion2GuildStats(interaction) {
  const channel = interaction.client.channels.cache.get(GUILD_STATS_CHANNEL_ID) ||
                  await interaction.client.channels.fetch(GUILD_STATS_CHANNEL_ID).catch(() => null);

  if (!channel) {
    return interaction.editReply({
      content: `❌ لم يتم العثور على قناة الإحصائيات (${GUILD_STATS_CHANNEL_ID}). تأكد من وجود الروم وصلاحيات البوت.`
    });
  }

  const existingConfig = await getGuildStatsPanelConfig();
  let m3rgeenMsg = null;
  let emperorMsg = null;

  if (existingConfig?.channel_id === GUILD_STATS_CHANNEL_ID) {
    if (existingConfig.m3rgeen_message_id) {
      m3rgeenMsg = await channel.messages.fetch(existingConfig.m3rgeen_message_id).catch(() => null);
    }
    if (existingConfig.emperor_message_id) {
      emperorMsg = await channel.messages.fetch(existingConfig.emperor_message_id).catch(() => null);
    }
  }

  const m3rgeenEmbed = await buildM3rgeenStatsEmbed();
  const emperorEmbed = await buildEmperorStatsEmbed();

  let m3rgeenAction = "UPDATED";
  let emperorAction = "UPDATED";

  // Handle M3RGEEN card independently
  if (m3rgeenMsg) {
    await m3rgeenMsg.edit({ embeds: [m3rgeenEmbed] });
  } else {
    m3rgeenMsg = await channel.send({ embeds: [m3rgeenEmbed] });
    m3rgeenAction = "CREATED";
  }

  // Handle Emperor card independently
  if (emperorMsg) {
    await emperorMsg.edit({ embeds: [emperorEmbed] });
  } else {
    emperorMsg = await channel.send({ embeds: [emperorEmbed] });
    emperorAction = "CREATED";
  }

  // Save final Message IDs in bot_state
  await saveGuildStatsPanelConfig({
    channel_id: GUILD_STATS_CHANNEL_ID,
    m3rgeen_message_id: m3rgeenMsg.id,
    emperor_message_id: emperorMsg.id,
    last_updated_at: new Date().toISOString()
  });

  if (m3rgeenAction === "UPDATED" && emperorAction === "UPDATED") {
    return interaction.editReply({
      content: `✅ **نظام إحصائيات القيلدات معد مسبقاً في القناة <#${GUILD_STATS_CHANNEL_ID}>!**\nتم تحديث الرسالتين القائمتين بنجاح دون إنشاء رسائل مكررة.`
    });
  }

  if (m3rgeenAction === "CREATED" && emperorAction === "CREATED") {
    return interaction.editReply({
      content: `✅ **تم إنشاء وتثبيت بطاقتي إحصائيات قيلدات AION 2 بنجاح في <#${GUILD_STATS_CHANNEL_ID}>!**\n• بطاقة 🪽 M3RGEEN (Global): \`${m3rgeenMsg.id}\`\n• بطاقة 👑 Emperor (Early Access): \`${emperorMsg.id}\``
    });
  }

  const m3rgeenStatus = m3rgeenAction === "CREATED" ? `تم إنشاء بطاقة جديدة (\`${m3rgeenMsg.id}\`)` : "تم تحديث البطاقة القائمة";
  const emperorStatus = emperorAction === "CREATED" ? `تم إنشاء بطاقة جديدة (\`${emperorMsg.id}\`)` : "تم تحديث البطاقة القائمة";

  return interaction.editReply({
    content: `✅ **تمت معالجة لوحتي إحصائيات قيلدات AION 2 في <#${GUILD_STATS_CHANNEL_ID}> بنجاح!**\n• بطاقة 🪽 M3RGEEN: ${m3rgeenStatus}\n• بطاقة 👑 Emperor: ${emperorStatus}`
  });
}

export async function refreshAion2GuildStats(client) {
  try {
    const config = await getGuildStatsPanelConfig();
    if (!config || !config.channel_id) {
      return;
    }

    const channel = client.channels.cache.get(config.channel_id) ||
                    await client.channels.fetch(config.channel_id).catch(() => null);

    if (!channel) {
      console.warn(`[Aion2GuildStats] Stats channel (${config.channel_id}) not found or bot lacks access.`);
      return;
    }

    if (config.m3rgeen_message_id) {
      try {
        const msg = await channel.messages.fetch(config.m3rgeen_message_id).catch(() => null);
        if (msg) {
          const embed = await buildM3rgeenStatsEmbed();
          await msg.edit({ embeds: [embed] });
        } else {
          console.warn(`[Aion2GuildStats] M3RGEEN message (${config.m3rgeen_message_id}) not found in channel.`);
        }
      } catch (err) {
        console.warn(`[Aion2GuildStats] Failed to edit M3RGEEN message: ${err.message}`);
      }
    }

    if (config.emperor_message_id) {
      try {
        const msg = await channel.messages.fetch(config.emperor_message_id).catch(() => null);
        if (msg) {
          const embed = await buildEmperorStatsEmbed();
          await msg.edit({ embeds: [embed] });
        } else {
          console.warn(`[Aion2GuildStats] Emperor message (${config.emperor_message_id}) not found in channel.`);
        }
      } catch (err) {
        console.warn(`[Aion2GuildStats] Failed to edit Emperor message: ${err.message}`);
      }
    }

    config.last_updated_at = new Date().toISOString();
    await saveGuildStatsPanelConfig(config).catch((err) => {
      console.warn(`[Aion2GuildStats] Failed to update timestamp: ${err.message}`);
    });
  } catch (err) {
    console.error("[Aion2GuildStats] Error in refreshAion2GuildStats:", err);
  }
}

let refreshDebounceTimer = null;

export function triggerAion2GuildStatsRefresh(client) {
  if (!client) return;
  if (refreshDebounceTimer) {
    clearTimeout(refreshDebounceTimer);
  }
  refreshDebounceTimer = setTimeout(() => {
    refreshDebounceTimer = null;
    refreshAion2GuildStats(client).catch((err) => {
      console.warn("[Aion2GuildStats] Debounced refresh failed:", err.message);
    });
  }, 4000);
}

export async function syncAion2GuildStatsOnStartup(client) {
  try {
    const config = await getGuildStatsPanelConfig();
    if (!config || !config.channel_id || (!config.m3rgeen_message_id && !config.emperor_message_id)) {
      return;
    }
    console.log("[Aion2GuildStats] Synchronizing guild stats cards on startup...");
    await refreshAion2GuildStats(client);
    console.log("[Aion2GuildStats] Startup stats synchronization completed.");
  } catch (err) {
    console.warn("[Aion2GuildStats] Startup sync warning:", err.message);
  }
}
