import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";
import { query } from "../database/index.js";

export async function createRoleMenu(interaction) {
  const name = interaction.options.getString("name");
  const type = interaction.options.getString("type");
  const roleStrings = interaction.options.getString("roles");

  const roleIds = roleStrings.split(",").map((r) => r.trim().replace(/[<@&>]/g, ""));
  const roles = [];

  for (const id of roleIds) {
    const role = interaction.guild.roles.cache.get(id);
    if (role) roles.push({ id: role.id, name: role.name });
  }

  if (!roles.length) {
    await interaction.reply({ content: "No valid roles found.", flags: 64 });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Role Menu — ${name}`)
    .setDescription("Select a role below to add or remove it from yourself.")
    .addFields({ name: "Available Roles", value: roles.map((r) => `<@&${r.id}>`).join("\n") })
    .setTimestamp();

  let components = [];

  if (type === "button" || type === "both") {
    const buttons = roles.slice(0, 5).map((r) =>
      new ButtonBuilder()
        .setCustomId(`roles:toggle:${r.id}`)
        .setLabel(r.name)
        .setStyle(ButtonStyle.Secondary)
    );
    components.push(new ActionRowBuilder().addComponents(buttons));
  }

  if (type === "select" || type === "both") {
    const options = roles.slice(0, 25).map((r) => ({
      label: r.name,
      value: r.id,
      description: `Toggle the ${r.name} role`,
    }));
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("roles:selectmenu")
          .setPlaceholder("Select a role to toggle...")
          .addOptions(options)
      )
    );
  }

  await interaction.reply({ content: "Role menu deployed.", flags: 64 });
  const msg = await interaction.channel.send({ embeds: [embed], components });

  await query(
    "INSERT INTO role_menus (guild_id, channel_id, message_id, name, type, roles) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (message_id) DO UPDATE SET roles=$6",
    [interaction.guildId, interaction.channelId, msg.id, name, type, JSON.stringify(roles)]
  );
}

export async function handleInteraction(interaction) {
  const parts = interaction.customId.split(":");

  if (parts[1] === "toggle") {
    const roleId = parts[2];
    await toggleRole(interaction, roleId);
  } else if (parts[1] === "selectmenu") {
    const roleId = interaction.values[0];
    await toggleRole(interaction, roleId);
  }
}

async function toggleRole(interaction, roleId) {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member;
  const role = interaction.guild.roles.cache.get(roleId);

  if (!role) {
    await interaction.editReply({ content: "Role not found." });
    return;
  }

  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(role);
    await interaction.editReply({ content: `Removed **${role.name}** from you.` });
  } else {
    await member.roles.add(role);
    await interaction.editReply({ content: `Added **${role.name}** to you.` });
  }
}
