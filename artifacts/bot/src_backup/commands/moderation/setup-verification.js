import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup-verification")
    .setDescription("إعداد نظام البوابة الأمنية وإرسال رسالة القوانين")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const rulesText = `أهلاً بك في مجتمع M3RGEEN! 🦍✨
يسعدنا انضمامك إلينا. لضمان بيئة ممتعة ومريحة للجميع، يرجى الالتزام بالقواعد التالية:

الاحترام المتبادل: تعامل مع الجميع بأخوة واحترام، وتجنب الإساءة أو السلوك السام (Toxic).

بيئة اللعب الصوتية (منع الأفلمة والتوتر): يمنع الصراخ، رفع الصوت، والنرجسية في الرومات الصوتية. تجنب لوم أخوياك بأسلوب هجومي ينكد اللعب (مثل: "ليه ما هيلت؟ ليه ما ساعدت؟"). هدفنا التعريق بحماس وبدون بث توتر.

منع التسلط والمضايقات: التسلط على اللاعبين، أو تعمد مضايقتهم واستفزازهم أثناء اللعب خط أحمر.

منع الإعلانات والسبام: يمنع نشر روابط سيرفرات أخرى أو الترويج الشخصي بدون إذن الإدارة.

خصوصية الأعضاء: يمنع تماماً إزعاج الأعضاء في الخاص أو تداول معلوماتهم الشخصية.

اضغط على زر (تفعيل العضوية) في الأسفل لتستلم رتبة "المعرقين" وتفتح لك باقي قنوات السيرفر. حياك الله بين أخوانك!`;

    const embed = new EmbedBuilder()
      .setTitle("قوانين مجتمع M3RGEEN 📜")
      .setDescription(rulesText)
      .setColor("#2b2d31");

    if (interaction.guild.iconURL()) {
      embed.setThumbnail(interaction.guild.iconURL({ extension: "png", size: 512 }));
    }

    const verifyButton = new ButtonBuilder()
      .setCustomId("verify:agree")
      .setLabel("✅ تفعيل العضوية")
      .setStyle(ButtonStyle.Success);

    const actionRow = new ActionRowBuilder().addComponents(verifyButton);

    await interaction.channel.send({
      embeds: [embed],
      components: [actionRow],
    });

    await interaction.reply({
      content: "تم إرسال رسالة القوانين ونظام البوابة الأمنية بنجاح.",
      flags: 64, // Ephemeral
    });
  },
};
