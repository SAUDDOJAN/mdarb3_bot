import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkYouTube } from "../../tasks/socialNotifier.js";

export default {
  data: new SlashCommandBuilder()
    .setName("checkyt")
    .setDescription("Force check YouTube for new videos")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });
    try {
      await checkYouTube(client);
      await interaction.editReply("✅ YouTube check executed.");
    } catch (err) {
      await interaction.editReply(`❌ Error: ${err.message}`);
    }
  },
};
