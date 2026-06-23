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
      const result = await checkYouTubeDebug(interaction.client);
      
      // Test channel permissions
      let channelTest = "OK";
      try {
        const channel = await interaction.client.channels.fetch("1405207264868175952");
        if (!channel) channelTest = "Channel not found";
        else {
          const perms = channel.permissionsFor(interaction.client.user);
          if (!perms.has("SendMessages")) channelTest = "Missing SendMessages";
          if (!perms.has("EmbedLinks")) channelTest = "Missing EmbedLinks";
        }
      } catch(err) {
        channelTest = "Error fetching channel: " + err.message;
      }

      await interaction.editReply(`✅ YouTube check executed.\nChannel Permission: ${channelTest}\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``);
    } catch (err) {
      console.error(err);
      await interaction.editReply(`❌ Error running check:\n\`\`\`js\n${err.message}\n\`\`\``);
    }
  },
};
