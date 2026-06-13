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
      const { checkYouTubeDebug } = await import("../../tasks/socialNotifier.js");
      const result = await checkYouTubeDebug(client);
      await interaction.editReply(`✅ YouTube check executed.\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``);
    } catch (err) {
      await interaction.editReply(`❌ Error: ${err.message}`);
    }
  },
};
