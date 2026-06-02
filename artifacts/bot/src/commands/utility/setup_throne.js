import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { setupThroneJoinEmbed } from "../../modules/throneliberty.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup_throne")
    .setDescription("إعداد نموذج الانضمام لجيلد Throne and Liberty")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await setupThroneJoinEmbed(interaction);
  },
};
