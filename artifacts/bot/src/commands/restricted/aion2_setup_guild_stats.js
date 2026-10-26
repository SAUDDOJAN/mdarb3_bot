import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { setupAion2GuildStats } from "../../modules/aion2GuildStats.js";

export default {
  data: new SlashCommandBuilder()
    .setName("aion2_setup_guild_stats")
    .setDescription("إنشاء أو تحديث لوحتي إحصائيات قيلدات AION 2 في القناة المخصصة")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ عذراً، هذا الأمر مخصص للإدارة العليا فقط.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await setupAion2GuildStats(interaction);
    } catch (err) {
      console.error("[aion2_setup_guild_stats] Error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ حدث خطأ أثناء إعداد لوحة الإحصائيات: ${err.message}` }).catch(() => {});
      } else {
        await interaction.reply({ content: `❌ حدث خطأ أثناء إعداد لوحة الإحصائيات: ${err.message}`, ephemeral: true }).catch(() => {});
      }
    }
  }
};
