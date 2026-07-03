import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { addPoints } from "../../modules/management.js";

export default {
  data: new SlashCommandBuilder()
    .setName("give_points")
    .setDescription("إعطاء نقاط مشاركة لعضو معين (للإدارة فقط)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setDescription("العضو المراد إعطائه النقاط").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("عدد النقاط").setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    await interaction.deferReply({ ephemeral: true });

    try {
      await addPoints(interaction.client, interaction.guildId, target.id, amount);
      
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ تم إضافة النقاط بنجاح")
        .setDescription(`تم منح **${amount}** نقطة للعضو <@${target.id}>.`);
        
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[GivePoints] Error:", err);
      await interaction.editReply({ content: "❌ حدث خطأ أثناء محاولة إضافة النقاط." });
    }
  }
};
