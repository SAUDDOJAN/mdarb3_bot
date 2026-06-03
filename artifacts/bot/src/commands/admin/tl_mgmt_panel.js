import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, UserSelectMenuBuilder, EmbedBuilder } from "discord.js";
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
      .setDescription("هذه اللوحة مخصصة لإدارة أعضاء جيلد Throne and Liberty.\n\nاستخدم القائمة المنسدلة أدناه للبحث واختيار العضو المراد إزالته. سيتم مسح كافة بياناته وسحب رتبة TL منه مع إبقائه برتبة المعرقين.")
      .setFooter({ text: "Throne and Liberty • M3RGEEN Admin Panel" });

    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId("tl:mgmt:user_select_remove")
        .setPlaceholder("ابحث واختر العضو للإزالة...")
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: "✅ تم إرسال لوحة الإدارة وتحديث عداد الأعضاء بنجاح." });
  },
};
