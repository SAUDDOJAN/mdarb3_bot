import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("aion2_migration_setup")
    .setDescription("Setup the AION 2 Early Access Migration Panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ لا تملك صلاحية لاستخدام هذا الأمر.", ephemeral: true });
    }
    
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor("#2b2d31")
      .setTitle("⚡ الانتقال إلى Early Access | AION 2")
      .setDescription(`بسبب رغبة عدد جيد من أعضاء المعرقين في بدء رحلتهم من الـ Early Access، جهزنا لكم مسارًا مستقلاً ومنظمًا من البداية.

أعضاء الـ Early Access لن يكونوا مشتتين أو بدون Guild.
سيكون لكم Guild خاص بقيادة سيرفر المعرقين، مع شات مخصص وروم صوتي خاص بكم، وقابل للتوسعة لاحقًا حسب الحاجة.

عند انتقالك إلى Early Access:
• سيتم نقلك من قائمة الـ Global الحالية إلى قائمة الـ Early Access.
• سيتم تفريغ مقعدك وكلاسك من الـ Global ليستفيد منه لاعب آخر.
• جميع لاعبي الـ Early Access سيتم جمعهم وتنظيمهم معنا تحت Guild واحد بقيادتنا.

إذا كنت متأكدًا أنك ستلعب Early Access، استخدم الزر أدناه.

اختر Early Access فقط إذا كنت متأكداً من قرارك.`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("temp_aion2_global_migration_panel")
        .setLabel("⚡ الانتقال إلى Early Access")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: "✅ تم إرسال نموذج الانتقال إلى Early Access بنجاح." });
  }
};
