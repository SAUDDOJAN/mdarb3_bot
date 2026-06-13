import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from "discord.js";
import path from "path";
import fs from "fs";
import { query } from "../database/index.js";
import {
  EVENT_IMAGES,
  ALERT_COLORS,
  ALERT_LABELS,
  PANEL_ROLES,
  PANEL_ROLE_EMOJIS,
} from "../constants/eventImages.js";

export async function sendAlertPanel(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔔 اشتراكات تنبيهات M3RGEEN")
    .setDescription(
      "اضغط على الأزرار أدناه لتفعيل/تعطيل تنبيهات الفعاليات.\n" +
      "سيقوم البوت بمنشن (Mention) لك عند اقتراب موعد الفعالية.\n\n" +
      Object.entries(PANEL_ROLE_EMOJIS)
        .map(([key, emoji]) => `${emoji} **${ALERT_LABELS[key]}**`)
        .join("\n")
    )
    .setFooter({ text: "اضغط مرة أخرى لإلغاء الاشتراك." })
    .setTimestamp();

  const rows = buildPanelRows();

  await interaction.reply({ content: "Alert panel deployed.", flags: 64 });
  await interaction.channel.send({ embeds: [embed], components: rows });
}

function buildPanelRows() {
  const buttons = PANEL_ROLES.map((type) =>
    new ButtonBuilder()
      .setCustomId(`alerts:toggle:${type}`)
      .setLabel(ALERT_LABELS[type])
      .setEmoji(PANEL_ROLE_EMOJIS[type])
      .setStyle(ButtonStyle.Secondary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

export async function handleInteraction(interaction) {
  const [, action, alertType] = interaction.customId.split(":");
  if (action === "toggle") {
    await toggleSubscription(interaction, alertType);
  }
}

async function toggleSubscription(interaction, alertType) {
  await interaction.deferReply({ flags: 64 });

  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  const existing = await query(
    "SELECT id FROM alert_subscriptions WHERE guild_id=$1 AND user_id=$2 AND alert_type=$3",
    [guildId, userId, alertType]
  );

  const label = ALERT_LABELS[alertType] ?? alertType;
  const emoji = PANEL_ROLE_EMOJIS[alertType] ?? "";

  if (existing.rows.length > 0) {
    await query(
      "DELETE FROM alert_subscriptions WHERE guild_id=$1 AND user_id=$2 AND alert_type=$3",
      [guildId, userId, alertType]
    );
    await interaction.editReply({
      content: `${emoji} You have **unsubscribed** from **${label}** alerts.`,
    });
  } else {
    await query(
      "INSERT INTO alert_subscriptions (guild_id, user_id, alert_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [guildId, userId, alertType]
    );
    await interaction.editReply({
      content: `${emoji} You have **subscribed** to **${label}** alerts.`,
    });
  }
}

export async function fireAlert(client, guildId, alertType) {
  try {
    const configRes = await query(
      "SELECT alert_channel_id FROM guild_config WHERE guild_id=$1",
      [guildId]
    );
    const channelId = configRes.rows[0]?.alert_channel_id;
    if (!channelId) return;

    const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.error(`[Alerts] Could not find channel ${channelId} in guild ${guildId}`);
      return;
    }

    await deduplicateAlert(client, guildId, alertType, channel);

    const baseType = alertType.replace("_prep", "");
    const subscribers = await query(
      "SELECT user_id FROM alert_subscriptions WHERE guild_id=$1 AND alert_type=$2",
      [guildId, baseType]
    );

    const subRows = subscribers.rows;
    const subsForBase = subRows.length > 0
      ? subRows.map((r) => `<@${r.user_id}>`).join(" ")
      : "";

    const label = ALERT_LABELS[alertType] ?? alertType;
    const color = ALERT_COLORS[alertType] ?? 0x5865f2;
    const imagePath = EVENT_IMAGES[alertType];
    const isPrep = alertType.endsWith("_prep");
    const isAlert = alertType.endsWith("_alert");

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(
         isPrep ? `⏰ استعد! ${label}` 
         : isAlert ? `🚨 تنبيه! ${label}`
         : `🔔 بدأ الآن! ${label}`
      )
      .setDescription(
        alertType === "siege_alert"
          ? `**تحالف القيلدات (Siege)** سيبدأ بعد 30 دقيقة!\nيرجى التجهز والتواجد في المكان المطلوب.`
          : isPrep
            ? `**${label}** سيبدأ خلال 5 دقائق!\nيرجى التجهز والتواجد في المكان المطلوب.`
            : `**${label}** بدأ الآن!\nانضموا الآن وبالتوفيق للجميع! ⚔️`
      )
      .setTimestamp();

    const files = [];
    if (imagePath) {
      if (imagePath.startsWith("attachment://")) {
        const fileName = imagePath.replace("attachment://", "");
        const fullPath = path.join(process.cwd(), "src", "assets", fileName);
        if (fs.existsSync(fullPath)) {
          const attachment = new AttachmentBuilder(fullPath, { name: fileName });
          files.push(attachment);
          embed.setImage(`attachment://${fileName}`);
        }
      } else {
        embed.setImage(imagePath);
      }
    }

    let content = subsForBase || undefined;
    if (alertType === "siege_alert") {
      content = "<@&1401376073077231702>\n" + (content ?? "");
    }

    const sentMsg = await channel.send({
      content: content,
      embeds: [embed],
      files: files,
    });

    await query(
      `INSERT INTO active_alerts (guild_id, alert_type, channel_id, message_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (guild_id, alert_type) DO UPDATE
       SET channel_id=$3, message_id=$4, created_at=NOW()`,
      [guildId, alertType, channel.id, sentMsg.id]
    );

    console.log(`[Alerts] Fired "${alertType}" alert in guild ${guildId}`);
  } catch (err) {
    console.error(`[Alerts] Failed to fire "${alertType}" in guild ${guildId}:`, err);
  }
}

async function deduplicateAlert(client, guildId, alertType, channel) {
  const existing = await query(
    "SELECT channel_id, message_id FROM active_alerts WHERE guild_id=$1 AND alert_type=$2",
    [guildId, alertType]
  );

  if (!existing.rows[0]) return;

  const { channel_id, message_id } = existing.rows[0];
  try {
    const oldChannel = client.channels.cache.get(channel_id) ?? channel;
    const oldMsg = await oldChannel.messages.fetch(message_id).catch(() => null);
    if (oldMsg) await oldMsg.delete().catch(() => {});
  } catch {}

  await query(
    "DELETE FROM active_alerts WHERE guild_id=$1 AND alert_type=$2",
    [guildId, alertType]
  );
}

export async function getSubscribers(guildId, alertType) {
  const res = await query(
    "SELECT user_id FROM alert_subscriptions WHERE guild_id=$1 AND alert_type=$2",
    [guildId, alertType]
  );
  return res.rows.map((r) => r.user_id);
}

