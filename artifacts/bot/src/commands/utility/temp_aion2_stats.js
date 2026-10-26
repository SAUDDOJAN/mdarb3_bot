import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { query } from "../../database/index.js";
import { hasReviewerPermission } from "../../modules/aion2GlobalTemp.js";

const TARGETS = {
  "Cleric": 23,
  "Templar": 16,
  "Chanter": 16,
  "Gladiator": 18,
  "Sorcerer": 16,
  "Ranger": 16,
  "Assassin": 15,
  "Spiritmaster": 8
};

const ALL_CLASSES = [
  "Gladiator", "Templar", 
  "Ranger", "Assassin", 
  "Sorcerer", "Spiritmaster", "Chanter", "Cleric"
];

export default {
  data: new SlashCommandBuilder()
    .setName("temp_aion2_stats")
    .setDescription("عرض إحصائيات الجيلد والكلاسات المقبولة في AION 2 (للإدارة فقط)"),
  async execute(interaction) {
    if (!hasReviewerPermission(interaction.member)) {
      return interaction.reply({ content: "❌ لا تملك الصلاحية لاستخدام هذا الأمر.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: false });

    try {
      const statsRes = await query(`SELECT selected_class, COUNT(*) as count FROM aion2_global_applications WHERE status = 'ACCEPTED' AND guild_type = 'GLOBAL' AND transition_status IS NULL GROUP BY selected_class`);
      
      let totalAccepted = 0;
      const acceptedCounts = {};
      
      // Initialize all classes with 0
      for (const cls of ALL_CLASSES) {
        acceptedCounts[cls] = 0;
      }

      for (const row of statsRes.rows) {
        const c = parseInt(row.count, 10);
        acceptedCounts[row.selected_class] = c;
        totalAccepted += c;
      }

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("📊 التوزيع العسكري للجيلد | AION 2 Global")
        .setDescription(`**إجمالي الأعضاء المقبولين:** ${totalAccepted} / 128\n**المقاعد المتبقية:** ${128 - totalAccepted}`)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }));

      let targetedText = "";
      for (const [cls, target] of Object.entries(TARGETS)) {
        const current = acceptedCounts[cls];
        const missing = Math.max(0, target - current);
        
        let icon = "🔹";
        if (current >= target) {
          icon = "✅";
        } else if (["Cleric", "Templar", "Assassin", "Ranger"].includes(cls)) {
          icon = "⚠️";
        }

        targetedText += `${icon} **${cls}:** ${current} / ${target} (متبقي ${missing})\n`;
      }
      embed.addFields({ name: "🎯 خطة الكلاسات الإلزامية", value: targetedText, inline: false });

      await interaction.editReply({ embeds: [embed] });

    } catch (e) {
      console.error(e);
      await interaction.editReply({ content: "❌ حدث خطأ أثناء استرجاع الإحصائيات." });
    }
  }
};
