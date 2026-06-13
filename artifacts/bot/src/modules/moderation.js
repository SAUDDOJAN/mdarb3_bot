import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { query } from "../database/index.js";

async function getNextCaseNumber(guildId) {
  const res = await query(
    "SELECT COALESCE(MAX(case_number), 0) + 1 AS next FROM mod_cases WHERE guild_id = $1",
    [guildId]
  );
  return res.rows[0].next;
}

async function logCase(guildId, userId, modId, type, reason, duration = null) {
  const caseNum = await getNextCaseNumber(guildId);
  await query(
    "INSERT INTO mod_cases (case_number, guild_id, user_id, moderator_id, type, reason, duration) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [caseNum, guildId, userId, modId, type, reason, duration]
  );
  return caseNum;
}

export async function ban(interaction) {
  const target = interaction.options.getMember("user");
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  if (!target) {
    await interaction.reply({ content: "User not found in this server.", flags: 64 });
    return;
  }

  if (!target.bannable) {
    await interaction.reply({ content: "I cannot ban this user.", flags: 64 });
    return;
  }

  await target.ban({ reason });
  const caseNum = await logCase(interaction.guildId, target.id, interaction.user.id, "ban", reason);

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`Banned | Case #${caseNum}`)
    .addFields(
      { name: "User", value: `${target.user.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
      { name: "Reason", value: reason }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function kick(interaction) {
  const target = interaction.options.getMember("user");
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  if (!target) {
    await interaction.reply({ content: "User not found in this server.", flags: 64 });
    return;
  }

  if (!target.kickable) {
    await interaction.reply({ content: "I cannot kick this user.", flags: 64 });
    return;
  }

  await target.kick(reason);
  const caseNum = await logCase(interaction.guildId, target.id, interaction.user.id, "kick", reason);

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle(`Kicked | Case #${caseNum}`)
    .addFields(
      { name: "User", value: `${target.user.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
      { name: "Reason", value: reason }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function warn(interaction) {
  const target = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason");

  await query(
    "INSERT INTO warns (guild_id, user_id, moderator_id, reason) VALUES ($1,$2,$3,$4)",
    [interaction.guildId, target.id, interaction.user.id, reason]
  );
  const caseNum = await logCase(interaction.guildId, target.id, interaction.user.id, "warn", reason);

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`Warning Issued | Case #${caseNum}`)
    .addFields(
      { name: "User", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
      { name: "Reason", value: reason }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function cases(interaction) {
  const target = interaction.options.getUser("user");
  const res = await query(
    "SELECT * FROM mod_cases WHERE guild_id = $1 AND user_id = $2 ORDER BY case_number DESC LIMIT 10",
    [interaction.guildId, target.id]
  );

  if (res.rows.length === 0) {
    await interaction.reply({ content: `No cases found for **${target.tag}**.`, flags: 64 });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Cases for ${target.tag}`)
    .setDescription(
      res.rows
        .map((c) => `**Case #${c.case_number}** — ${c.type.toUpperCase()}\n> ${c.reason} — <t:${Math.floor(new Date(c.created_at).getTime() / 1000)}:R>`)
        .join("\n\n")
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function timeout(interaction) {
  const target = interaction.options.getMember("user");
  const minutes = interaction.options.getInteger("minutes");
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  if (!target?.moderatable) {
    await interaction.reply({ content: "I cannot timeout this user.", flags: 64 });
    return;
  }

  await target.timeout(minutes * 60 * 1000, reason);
  const caseNum = await logCase(interaction.guildId, target.id, interaction.user.id, "timeout", reason, minutes);

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle(`Timeout | Case #${caseNum}`)
    .addFields(
      { name: "User", value: `${target.user.tag}`, inline: true },
      { name: "Duration", value: `${minutes} minute(s)`, inline: true },
      { name: "Reason", value: reason }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function handleInteraction(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("mod:move_reason:")) {
    const [, , executorId, targetId] = interaction.customId.split(":");
    
    if (interaction.user.id !== executorId) {
      await interaction.reply({ content: "❌ لا يمكنك اختيار السبب لأنك لست من قام بهذا الإجراء.", flags: 64 });
      return;
    }

    const selectedReason = interaction.values[0];
    const oldEmbed = interaction.message.embeds[0];
    
    const newEmbed = EmbedBuilder.from(oldEmbed);
    // Find the field index
    const fieldIndex = newEmbed.data.fields?.findIndex(f => f.name === "السبب المذكور") ?? 0;
    if (fieldIndex !== -1 && newEmbed.data.fields) {
      newEmbed.data.fields[fieldIndex].value = `**${selectedReason}**`;
    } else {
      newEmbed.addFields({ name: "السبب المذكور", value: `**${selectedReason}**` });
    }
    
    await interaction.update({ embeds: [newEmbed], components: [] });
  }
}
