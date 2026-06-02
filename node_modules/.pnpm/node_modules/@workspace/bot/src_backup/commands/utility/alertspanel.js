import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { sendAlertPanel } from "../../modules/alerts.js";
import { query } from "../../database/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("alerts")
    .setDescription("Manage the alert subscription system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("panel")
        .setDescription("Deploy the alert subscription panel in this channel")
    )
    .addSubcommand((sub) =>
      sub
        .setName("setchannel")
        .setDescription("Set the channel where event alerts are posted")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("The alerts output channel")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("test")
        .setDescription("Fire a test alert immediately")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Alert type to test")
            .setRequired(true)
            .addChoices(
              { name: "Rift Prep",     value: "rift_prep" },
              { name: "Rift",          value: "rift" },
              { name: "Shugo Prep",    value: "shugo_prep" },
              { name: "Shugo",         value: "shugo" },
              { name: "Maintenance",   value: "maint" },
              { name: "Daily Reset",   value: "daily" },
              { name: "Siege Prep",    value: "siege_prep" },
              { name: "Siege",         value: "siege" }
            )
        )
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === "panel") {
      await sendAlertPanel(interaction);
      return;
    }

    if (sub === "setchannel") {
      const ch = interaction.options.getChannel("channel");
      await query(
        "INSERT INTO guild_config (guild_id, alert_channel_id) VALUES ($1,$2) ON CONFLICT (guild_id) DO UPDATE SET alert_channel_id=$2, updated_at=NOW()",
        [interaction.guildId, ch.id]
      );
      await interaction.reply({
        content: `✅ Alert channel set to ${ch}. Event alerts will be posted there.`,
        flags: 64,
      });
      return;
    }

    if (sub === "test") {
      const type = interaction.options.getString("type");
      await interaction.reply({ content: `🔔 Firing test alert: **${type}**...`, flags: 64 });
      const { fireAlert } = await import("../../modules/alerts.js");
      await fireAlert(client, interaction.guildId, type);
    }
  },
};
