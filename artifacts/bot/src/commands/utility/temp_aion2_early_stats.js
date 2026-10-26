import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { query } from "../../database/index.js";
import { hasReviewerPermission } from "../../modules/aion2GlobalTemp.js";

export default {
  data: new SlashCommandBuilder()
    .setName("temp_aion2_early_stats")
    .setDescription("عرض إحصائية مقاعد الـ Early Access الخاصة بـ AION 2"),
  async execute(interaction) {
    if (!hasReviewerPermission(interaction.member)) {
      return interaction.reply({ content: "❌ لا تملك الصلاحية لاستخدام هذا الأمر.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: false });

    try {
      const statsRes = await query(`
        SELECT COUNT(*) as count 
        FROM aion2_global_applications 
        WHERE status = 'ACCEPTED' AND guild_type = 'EARLY_ACCESS'
      `);
      
      const totalAccepted = parseInt(statsRes.rows[0].count, 10);
      const capacity = 128;
      const remaining = Math.max(0, capacity - totalAccepted);

      const embed = new EmbedBuilder()
        .setColor("#FFA500")
        .setTitle("⚡ AION 2 Early Access | إحصائية الجيلد")
        .setDescription(`**إجمالي الأعضاء:**\n${totalAccepted} / ${capacity}\n\n**المقاعد المتبقية:**\n${remaining}`)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }));

      await interaction.editReply({ embeds: [embed] });

    } catch (e) {
      console.error(e);
      await interaction.editReply({ content: "❌ حدث خطأ أثناء استخراج الإحصائيات." });
    }
  }
};
