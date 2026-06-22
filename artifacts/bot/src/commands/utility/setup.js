import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { query } from "../../database/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure bot settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("logchannel")
        .setDescription("Set the logging channel")
        .addChannelOption((o) => o.setName("channel").setDescription("The channel to send logs to").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("welcome")
        .setDescription("Set the welcome message channel")
        .addChannelOption((o) => o.setName("channel").setDescription("The welcome channel").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("farewell")
        .setDescription("Set the farewell message channel")
        .addChannelOption((o) => o.setName("channel").setDescription("The farewell channel").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("ticketcategory")
        .setDescription("Set the category where tickets are created")
        .addChannelOption((o) => o.setName("category").setDescription("The category").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("legionrole")
        .setDescription("Set the Legion role assigned to accepted recruits")
        .addRoleOption((o) => o.setName("role").setDescription("The Legion role").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("adminchannel")
        .setDescription("Set the admin/log channel for AION 2 recruitment and general alerts")
        .addChannelOption((o) => o.setName("channel").setDescription("The admin channel").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("tladminchannel")
        .setDescription("Set the admin channel for Throne and Liberty recruitment requests")
        .addChannelOption((o) => o.setName("channel").setDescription("The TL admin channel").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("powercardchannel")
        .setDescription("Set the channel where Power Cards are posted and updated")
        .addChannelOption((o) => o.setName("channel").setDescription("The power card channel").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("eventcategory")
        .setDescription("Set the category where event group VCs are created")
        .addChannelOption((o) => o.setName("category").setDescription("The VC category").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("eventlobbychannel")
        .setDescription("Set the lobby channel where event panels are posted by the admin panel")
        .addChannelOption((o) => o.setName("channel").setDescription("The event lobby/announcement channel").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("guildrole")
        .setDescription("Set the base AION 2 Guild role")
        .addRoleOption((o) => o.setName("role").setDescription("The Guild role").setRequired(true))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    await query(
      "INSERT INTO guild_config (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING",
      [guildId]
    );

    let field, value, label;

    if (sub === "logchannel") {
      const ch = interaction.options.getChannel("channel");
      field = "log_channel_id";
      value = ch.id;
      label = `Log channel set to ${ch}`;
    } else if (sub === "welcome") {
      const ch = interaction.options.getChannel("channel");
      field = "welcome_channel_id";
      value = ch.id;
      label = `Welcome channel set to ${ch}`;
    } else if (sub === "farewell") {
      const ch = interaction.options.getChannel("channel");
      field = "farewell_channel_id";
      value = ch.id;
      label = `Farewell channel set to ${ch}`;
    } else if (sub === "ticketcategory") {
      const ch = interaction.options.getChannel("category");
      field = "ticket_category_id";
      value = ch.id;
      label = `Ticket category set to **${ch.name}**`;
    } else if (sub === "legionrole") {
      const role = interaction.options.getRole("role");
      field = "legion_role_id";
      value = role.id;
      label = `Legion role set to **${role.name}** — assigned automatically on recruit acceptance`;
    } else if (sub === "adminchannel") {
      const ch = interaction.options.getChannel("channel");
      field = "admin_channel_id";
      value = ch.id;
      label = `AION 2 Admin channel set to ${ch}`;
    } else if (sub === "tladminchannel") {
      const ch = interaction.options.getChannel("channel");
      field = "tl_admin_channel_id";
      value = ch.id;
      label = `Throne and Liberty Admin channel set to ${ch}`;
    } else if (sub === "powercardchannel") {
      const ch = interaction.options.getChannel("channel");
      field = "powercard_channel_id";
      value = ch.id;
      label = `Power Card channel set to ${ch} — member cards will be posted and auto-updated here`;
    } else if (sub === "eventcategory") {
      const ch = interaction.options.getChannel("category");
      field = "event_category_id";
      value = ch.id;
      label = `Event VC category set to **${ch.name}** — group voice channels will be created here`;
    } else if (sub === "eventlobbychannel") {
      const ch = interaction.options.getChannel("channel");
      field = "event_lobby_channel_id";
      value = ch.id;
      label = `Event lobby channel set to ${ch} — event panels will be posted here by the admin control panel`;
    } else if (sub === "guildrole") {
      const role = interaction.options.getRole("role");
      field = "guild_role_id";
      value = role.id;
      label = `Guild role set to **${role.name}** — assigned to all members on acceptance`;
    }

    await query(`UPDATE guild_config SET ${field} = $1, updated_at = NOW() WHERE guild_id = $2`, [
      value,
      guildId,
    ]);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Setup Updated")
      .setDescription(label)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
