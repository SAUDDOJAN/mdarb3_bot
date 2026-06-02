import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { setupGw2JoinEmbed } from "../../modules/guildwars2.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup_gw2")
    .setDescription("إعداد رسالة الانضمام لقسم Guild Wars 2")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await setupGw2JoinEmbed(interaction);
  },
};
