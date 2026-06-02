import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup_event_admin")
    .setDescription("Post the persistent Event Control Panel for admins")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🛡️ لوحة تحكم الفعاليات")
      .setDescription(
        "**لوحة التحكم الإدارية للفعاليات**\n\n" +
        "🚀 **بدء فعالية** — إطلاق لوحة تشكيل المجموعات في قناة اللوبي وإشعار الأعضاء.\n\n" +
        "🗑️ **إعادة تعيين النقاط** — مسح جميع نقاط اللاعبين من قاعدة البيانات.\n\n" +
        "> ⚠️ هذه اللوحة مخصصة للمسؤولين فقط."
      )
      .setFooter({ text: "M3RGEEN — Event Control Panel" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mgmt:start_event")
        .setLabel("بدء فعالية")
        .setEmoji("🚀")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("mgmt:reset_points")
        .setLabel("إعادة تعيين النقاط")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ content: "✅ تم نشر لوحة التحكم.", flags: 64 });
    await interaction.channel.send({ embeds: [embed], components: [row] });
  },
};
