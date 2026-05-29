import { SlashCommandBuilder } from "discord.js";
import { handleSageJoinCommand } from "../../modules/sageController.js";

const SAGE_GUILD_ID = "1507696012410749030";

export const data = new SlashCommandBuilder()
  .setName("sage-join")
  .setDescription("انضم إلى تحالف الحصار (Siege) | Join the Siege Alliance");

export async function execute(interaction) {
  // ← Strict guild isolation — Sage server only
  if (interaction.guildId !== SAGE_GUILD_ID) {
    await interaction.reply({
      content: "❌ هذا الأمر مخصص لسيرفر Sage Alliance فقط.",
      flags: 64,
    });
    return;
  }

  await handleSageJoinCommand(interaction);
}
