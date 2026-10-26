import { 
  SlashCommandBuilder, 
  PermissionFlagsBits 
} from "discord.js";
import { buildPointsView } from "../../modules/aion2Lfg/admin/pagination.js";

export default {
  data: new SlashCommandBuilder()
    .setName("aion2_points")
    .setDescription("عرض نقاط أعضاء LFG الحالية للدورة الشهرية (إداري)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (e) {
      console.error("[aion2_points] Failed to deferReply:", e);
      return;
    }

    try {
      if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.editReply({ content: "❌ عذراً، هذا الأمر مخصص للإدارة العليا فقط." });
      }

      const data = await buildPointsView(0, interaction.user.id);
      return interaction.editReply({ embeds: [data.embed], components: data.components });
    } catch (err) {
      console.error("[aion2_points] Error executing command:", err);
      return interaction.editReply({ content: "❌ حدث خطأ أثناء جلب نقاط الأعضاء: " + err.message });
    }
  }
};
