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
    .setName("setup_guild_mgmt")
    .setDescription("Post the persistent Guild Management Panel for admins")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("⚙️ لوحة إدارة فيلق M3RGEEN")
      .setDescription(
        "**لوحة الإدارة العامة للفيلق — للمسؤولين فقط**\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "**⚙️ إدارة الأعضاء**\n" +
        "> اضغط الزر أدناه لاستعراض قائمة الأعضاء المقبولين.\n" +
        "> من بطاقة كل عضو يمكنك:\n\n" +
        "> 🗑️ **إزالة العضو وحذف بياناته** — يزيل دور Legion، يحذف بطاقة Power Radar ويمسح النقاط.\n\n" +
        "> 🔄 **مزامنة الإحصائيات** — يجلب أحدث البيانات من Shugo.gg ويحدّث السجل وبطاقة Power Radar.\n\n" +
        "> 🔗 **عرض البروفايل** — رابط مباشر لملف الشخصية على Shugo.gg.\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "> ⚠️ جميع الإجراءات تتطلب صلاحية **Administrator** وتُنفَّذ فورياً."
      )
      .setFooter({ text: "M3RGEEN — Guild Management Panel • للمسؤولين فقط" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mgmt:open_member_mgmt")
        .setLabel("إدارة الأعضاء")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({ content: "✅ تم نشر لوحة إدارة الفيلق.", flags: 64 });
    await interaction.channel.send({ embeds: [embed], components: [row] });
  },
};
