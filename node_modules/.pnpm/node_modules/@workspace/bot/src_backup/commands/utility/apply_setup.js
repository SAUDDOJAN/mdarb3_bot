import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { sendApplyPanel } from "../../modules/recruitment.js";

export default {
  data: new SlashCommandBuilder()
    .setName("apply_setup")
    .setDescription("Post the M3RGEEN recruitment application panel in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await sendApplyPanel(interaction);
  },
};
