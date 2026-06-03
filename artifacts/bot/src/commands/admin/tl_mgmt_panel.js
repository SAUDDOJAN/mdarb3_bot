import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tl_mgmt_panel")
    .setDescription("إرسال لوحة إدارة أعضاء Throne and Liberty إلى الروم الحالي.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor("#8B0000")
      .setTitle("🛡️ لوحة إدارة Throne and Liberty")
      .setDescription("هذه اللوحة مخصصة لإدارة أعضاء جيلد Throne and Liberty.\n\nاستخدم الزر أدناه لإزالة عضو من الجيلد ومسح كافة بياناته وسحب رتبة TL منه مع إبقائه برتبة المعرقين.")
      .setFooter({ text: "Throne and Liberty • M3RGEEN Admin Panel" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("tl:mgmt:remove")
        .setLabel("إزالة عضو ❌")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: "✅ تم إرسال لوحة الإدارة بنجاح.", ephemeral: true });
  },
};
