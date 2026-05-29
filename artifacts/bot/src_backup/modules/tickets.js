import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { query } from "../database/index.js";

export async function sendPanel(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Support Tickets — M3RGEEN")
    .setDescription(
      "Need help or have a question? Click the button below to open a private support ticket.\n\nOur team will assist you as soon as possible."
    )
    .setFooter({ text: "One ticket per user at a time." })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:open")
      .setLabel("Open a Ticket")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ content: "Ticket panel deployed.", flags: 64 });
  await interaction.channel.send({ embeds: [embed], components: [row] });
}

export async function handleInteraction(interaction) {
  const [, action, ...rest] = interaction.customId.split(":");

  if (action === "open") {
    await openTicket(interaction);
  } else if (action === "close") {
    await closeTicket(interaction);
  } else if (action === "claim") {
    await claimTicket(interaction);
  }
}

async function openTicket(interaction) {
  await interaction.deferReply({ flags: 64 });

  const existingRes = await query(
    "SELECT channel_id FROM tickets WHERE guild_id = $1 AND owner_id = $2 AND status = 'open'",
    [interaction.guildId, interaction.user.id]
  );

  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    await interaction.editReply({
      content: `You already have an open ticket: <#${existing.channel_id}>`,
    });
    return;
  }

  const configRes = await query(
    "SELECT ticket_category_id FROM guild_config WHERE guild_id = $1",
    [interaction.guildId]
  );
  const config = configRes.rows[0];

  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: config?.ticket_category_id ?? null,
    permissionOverwrites: [
      {
        id: interaction.guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ],
  });

  await query(
    "INSERT INTO tickets (guild_id, channel_id, owner_id) VALUES ($1,$2,$3)",
    [interaction.guildId, channel.id, interaction.user.id]
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:claim")
      .setLabel("Claim")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ticket:close")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Support Ticket")
    .setDescription(
      `Hello ${interaction.user}! Please describe your issue and a staff member will be with you shortly.`
    )
    .setTimestamp();

  await channel.send({
    content: `${interaction.user}`,
    embeds: [embed],
    components: [row],
  });

  await interaction.editReply({ content: `Your ticket has been opened: ${channel}` });
}

async function closeTicket(interaction) {
  await interaction.deferReply({ flags: 64 });

  const res = await query(
    "SELECT * FROM tickets WHERE channel_id = $1 AND status = 'open'",
    [interaction.channelId]
  );

  if (!res.rows[0]) {
    await interaction.editReply({ content: "No open ticket found in this channel." });
    return;
  }

  await query(
    "UPDATE tickets SET status = 'closed', closed_at = NOW() WHERE channel_id = $1",
    [interaction.channelId]
  );

  await interaction.editReply({ content: "Ticket closed. This channel will be deleted in 5 seconds." });

  setTimeout(async () => {
    await interaction.channel.delete().catch(() => {});
  }, 5000);
}

async function claimTicket(interaction) {
  const res = await query(
    "SELECT * FROM tickets WHERE channel_id = $1 AND status = 'open'",
    [interaction.channelId]
  );

  if (!res.rows[0]) {
    await interaction.reply({ content: "No open ticket found here.", flags: 64 });
    return;
  }

  await query(
    "UPDATE tickets SET claimed_by = $1 WHERE channel_id = $2",
    [interaction.user.id, interaction.channelId]
  );

  await interaction.reply({
    content: `Ticket claimed by ${interaction.user}.`,
  });
}
