import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import {
  getLatestCampaign,
  getConfirmationStats,
  buildAdminStatsEmbed,
  buildAdminStatsRow
} from "../../modules/aion2Confirmation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("aion2_confirmation_stats")
    .setDescription("View stats and member lists for the roster confirmation campaign (Admin Only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ لا تملك صلاحية لاستخدام هذا الأمر.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const campaign = await getLatestCampaign();
    if (!campaign) {
      return interaction.editReply({
        content: "❌ لا توجد أي حملة تأكيد مسجلة في النظام حالياً."
      });
    }

    const stats = await getConfirmationStats(campaign.id);
    const embed = buildAdminStatsEmbed(campaign, stats);
    const row = buildAdminStatsRow(stats.totalConfirmed, stats.totalUnconfirmed);

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }
};
