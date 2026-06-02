import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("sage_mgmt_panel")
    .setDescription("Post the persistent Guild Management Panel for Siege Alliance admins")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("⚙️ لوحة إدارة تحالف Siege Alliance")
      .setDescription(
        "**لوحة الإدارة العامة للتحالف — للمسؤولين فقط**\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "**⚙️ إدارة الأعضاء**\n" +
        "> اضغط الزر أدناه لاستعراض قائمة الأعضاء المقبولين.\n" +
        "> من بطاقة كل عضو يمكنك:\n\n" +
        "> 🗑️ **إزالة العضو وحذف بياناته** — يحذف بيانات العضو من سجلات الانضمام للتحالف.\n\n" +
        "> 🔄 **مزامنة الإحصائيات** — يجلب أحدث البيانات من Shugo.gg ويحدّث السجل.\n\n" +
        "> 🔗 **عرض البروفايل** — رابط مباشر لملف الشخصية على Shugo.gg.\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "> ⚠️ جميع الإجراءات تتطلب صلاحية **Administrator** وتُنفَّذ فورياً."
      )
      .setFooter({ text: "Siege Alliance — Management Panel • للمسؤولين فقط" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("sage:open_member_mgmt")
        .setLabel("إدارة الأعضاء")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({ content: "✅ تم نشر لوحة إدارة التحالف.", flags: 64 });
    await interaction.channel.send({ embeds: [embed], components: [row] });
  },
};
