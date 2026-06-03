import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, UserSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { updateTLMemberCount } from "../../modules/throneliberty.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tl_mgmt_panel")
    .setDescription("إرسال لوحة إدارة أعضاء Throne and Liberty إلى الروم الحالي.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Update count immediately when panel is generated
    await updateTLMemberCount(interaction.client);

    const embed = new EmbedBuilder()
      .setColor("#8B0000")
      .setTitle("🛡️ لوحة إدارة Throne and Liberty")
      .setDescription("هذه اللوحة مخصصة لإدارة أعضاء جيلد Throne and Liberty.\n\nاستخدم زر الإزالة لفتح نافذة إدخال الأيدي وطرد العضو، أو اضغط على زر عرض الأعضاء لرؤية القائمة الكاملة ونسخ الأيدي.")
      .setFooter({ text: "Throne and Liberty • M3RGEEN Admin Panel" });

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("tl:mgmt:remove")
        .setLabel("إزالة عضو ❌")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("tl:mgmt:list")
        .setLabel("عرض جميع الأعضاء 📜")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel.send({ embeds: [embed], components: [buttonRow] });
    await interaction.editReply({ content: "✅ تم إرسال لوحة الإدارة وتحديث عداد الأعضاء بنجاح." });
  },
};
