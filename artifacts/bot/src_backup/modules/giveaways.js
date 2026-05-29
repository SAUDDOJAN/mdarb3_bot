import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { query } from "../database/index.js";

export async function startGiveaway(interaction, client) {
  const prize = interaction.options.getString("prize");
  const minutes = interaction.options.getInteger("duration");
  const winners = interaction.options.getInteger("winners") ?? 1;

  const endsAt = new Date(Date.now() + minutes * 60 * 1000);

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("GIVEAWAY")
    .setDescription(
      `**Prize:** ${prize}\n\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n**Hosted by:** ${interaction.user}\n\nClick the button below to enter!`
    )
    .setTimestamp(endsAt);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway:enter")
      .setLabel("Enter Giveaway")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ content: "Giveaway started!", flags: 64 });
  const msg = await interaction.channel.send({ embeds: [embed], components: [row] });

  await query(
    "INSERT INTO giveaways (guild_id, channel_id, message_id, host_id, prize, winners, ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [interaction.guildId, interaction.channelId, msg.id, interaction.user.id, prize, winners, endsAt]
  );

  setTimeout(() => endGiveaway(msg.id, client), minutes * 60 * 1000);
}

export async function endGiveaway(messageId, client) {
  try {
    const res = await query(
      "SELECT * FROM giveaways WHERE message_id = $1 AND ended = FALSE",
      [messageId]
    );
    if (!res.rows[0]) return;

    const giveaway = res.rows[0];
    const entries = giveaway.entries ?? [];

    await query("UPDATE giveaways SET ended = TRUE WHERE message_id = $1", [messageId]);

    const channel = client.channels.cache.get(giveaway.channel_id);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);

    const winnerIds = [];
    const shuffled = [...entries].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(giveaway.winners, shuffled.length); i++) {
      winnerIds.push(shuffled[i]);
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("GIVEAWAY ENDED")
      .setDescription(
        winnerIds.length
          ? `**Prize:** ${giveaway.prize}\n**Winner(s):** ${winnerIds.map((id) => `<@${id}>`).join(", ")}\n**Hosted by:** <@${giveaway.host_id}>`
          : `**Prize:** ${giveaway.prize}\n\nNo valid entries — no winners this time.`
      )
      .setTimestamp();

    if (message) {
      await message.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    if (winnerIds.length) {
      await channel.send({
        content: `Congratulations ${winnerIds.map((id) => `<@${id}>`).join(", ")}! You won **${giveaway.prize}**!`,
      });
    }
  } catch (err) {
    console.error("[Giveaways] Error ending giveaway:", err);
  }
}

export async function rerollGiveaway(interaction, client) {
  const messageId = interaction.options.getString("message_id");

  const res = await query(
    "SELECT * FROM giveaways WHERE message_id = $1 AND guild_id = $2",
    [messageId, interaction.guildId]
  );

  if (!res.rows[0]) {
    await interaction.reply({ content: "Giveaway not found.", flags: 64 });
    return;
  }

  const giveaway = res.rows[0];
  const entries = giveaway.entries ?? [];
  if (!entries.length) {
    await interaction.reply({ content: "No entries to reroll.", flags: 64 });
    return;
  }

  const winner = entries[Math.floor(Math.random() * entries.length)];
  await interaction.reply({
    content: `Rerolled! New winner: <@${winner}>! Congratulations!`,
  });
}

export async function handleInteraction(interaction) {
  const [, action] = interaction.customId.split(":");

  if (action === "enter") {
    await enterGiveaway(interaction);
  }
}

async function enterGiveaway(interaction) {
  await interaction.deferReply({ flags: 64 });

  const res = await query(
    "SELECT * FROM giveaways WHERE message_id = $1 AND ended = FALSE",
    [interaction.message.id]
  );

  if (!res.rows[0]) {
    await interaction.editReply({ content: "This giveaway has ended." });
    return;
  }

  const giveaway = res.rows[0];
  const entries = giveaway.entries ?? [];

  if (entries.includes(interaction.user.id)) {
    await interaction.editReply({ content: "You are already entered in this giveaway!" });
    return;
  }

  entries.push(interaction.user.id);
  await query("UPDATE giveaways SET entries = $1 WHERE message_id = $2", [
    JSON.stringify(entries),
    interaction.message.id,
  ]);

  await interaction.editReply({
    content: `You have entered the giveaway! Total entries: **${entries.length}**`,
  });
}
