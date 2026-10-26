import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { sendShugoTestPanel, TEST_APPLY_CHANNEL_ID } from "../../modules/aion2ShugoRegistration.js";

export default {
  data: new SlashCommandBuilder()
    .setName("aion2_shugo_setup")
    .setDescription("نشر لوحة تسجيل AION 2 التجريبية بنظام Shugo في روم الاختبار")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ لا تملك صلاحية لاستخدام هذا الأمر.", ephemeral: true });
    }

    try {
      await sendShugoTestPanel(interaction);
    } catch (err) {
      console.error("[aion2_shugo_setup] Error:", err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `❌ حدث خطأ: ${err.message}`, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: `❌ حدث خطأ: ${err.message}`, ephemeral: true }).catch(() => {});
      }
    }
  }
};
