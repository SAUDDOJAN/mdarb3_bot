import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { syncAllSagePermissions, SAGE_GUILD_ID } from "../../modules/sagePermissionsSync.js";

export const data = new SlashCommandBuilder()
  .setName("sage-sync-permissions")
  .setDescription("مزامنة وضبط صلاحيات كافة رومات ورتب سيرفر تحالف الحصارات تلقائياً")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (interaction.guildId !== SAGE_GUILD_ID) {
    return interaction.reply({
      content: "❌ هذا الأمر مخصص حصراً لسيرفر تحالف الحصارات (SAGE Alliance).",
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const result = await syncAllSagePermissions(interaction.guild);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("🛡️✨ تم ضبط ومزامنة صلاحيات السيرفر بالكامل بنجاح!")
      .setDescription(
        [
          "**تمت مراجعة وبرمجة صلاحيات كافة الفئات والرومات تلقائياً:**",
          "",
          "✅ **بوابة التحالف (📌):** القوانين للقراءة، والتسجيل للأعضاء الجدد، وروم القادة للقادة فقط.",
          "✅ **القيادة والسيطرة (📢):** الأوامر والخطط وتوزيع القوات للقراءة لجميع الأعضاء، والتعديل للقيادة.",
          "✅ **ساحة التحالف (⚔️):** شات التحالف مفتوح لجميع أعضاء التحالف المعتمدين.",
          "✅ **صوت التحالف (🔊):** الكول العام لجميع الأعضاء، وغرف القيادة والاغتيال مقفلة ومخصصة للرتب.",
          "✅ **إدارة السيرفر (🔐):** مشفرة ومقفلة حصراً على مجلس التحالف وقائد التحالف.",
          "",
          `👑 **رتبة الأعضاء المعتمدة:** <@&${result.memberRole.id}>`,
          `👥 **تم تحديث وتثبيت رتبة التحالف لـ:** \`${result.backfilledCount}\` عضو معتمد.`,
        ].join("\n")
      )
      .setFooter({ text: "تحالف الحصارات • نظام الصلاحيات الآلي" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[SageSyncPerms] Command error:", err);
    await interaction.editReply({
      content: `❌ حدث خطأ أثناء مزامنة الصلاحيات: ${err.message}`,
    });
  }
}

export default { data, execute };
