import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import {
  scanWelcomeMessages,
  createCleanupSession,
  GENERAL_CHAT_CHANNEL_ID
} from "../../modules/welcomeCleanup.js";

export default {
  data: new SlashCommandBuilder()
    .setName("cleanup_old_welcomes")
    .setDescription("فحص وتنظيف رسائل الترحيب القديمة للبوت في الشات العام")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(opt =>
      opt.setName("limit")
        .setDescription("الحد الأقصى لعدد الرسائل المراد فحصها للخلف (افتراضي: 1000)")
        .setMinValue(100)
        .setMaxValue(2000)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ هذا الأمر مخصص للإدارة العليا فقط.", ephemeral: true });
    }

    await interaction.deferReply({ flags: 64 });

    const scanLimit = interaction.options.getInteger("limit") || 1000;

    let scanResult;
    try {
      scanResult = await scanWelcomeMessages(interaction.client, scanLimit);
    } catch (err) {
      return interaction.editReply({ content: `❌ حدث خطأ أثناء فحص الشات العام: ${err.message}` });
    }

    const { channel, matched, totalScanned } = scanResult;

    if (matched.length === 0) {
      return interaction.editReply({
        content: `ℹ️ **لم يتم العثور على أي رسائل ترحيب قديمة مطابقة في الشات العام (<#${GENERAL_CHAT_CHANNEL_ID}>)!**\n` +
                 `تم فحص آخر \`${totalScanned}\` رسالة بنجاح ولم يُعثر على رسائل ترحيب قديمة تطابق الفلتر.`
      });
    }

    const sessionId = createCleanupSession(interaction.user.id, channel.id, matched.map(m => m.id));

    const embed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle("🧹 تأكيد تنظيف رسائل الترحيب القديمة")
      .setDescription(
        `• **القناة المستهدفة:** <#${GENERAL_CHAT_CHANNEL_ID}> (${channel.name})\n` +
        `• **إجمالي الرسائل المفحوصة:** \`${totalScanned}\` رسالة\n` +
        `• **رسائل الترحيب المكتشفة:** \`${matched.length}\` رسالة\n\n` +
        `**معايير الأمان المطبقة:**\n` +
        `✅ مرسلة حصراً بواسطة بوت **MDARB3 Manager**.\n` +
        `✅ داخل الشات العام فقط.\n` +
        `✅ تحتوي حصراً على عبارتي الترحيب: (\`في جيش المعرقين\` و \`الميدان ميدانك\`).\n` +
        `❌ **ممنوع مسح:** أي رسائل للأعضاء، أو بوتات أخرى، أو إعلانات البوت الأخرى.\n\n` +
        `اضغط على زر **تأكيد الحذف** للبدء بعملية التنظيف، أو **إلغاء** للتراجع.`
      )
      .setFooter({ text: "عملية إدارية آمنة • تحالف M3RGEEN" })
      .setTimestamp();

    const confirmBtn = new ButtonBuilder()
      .setCustomId(`cleanup_welcome:confirm:${sessionId}`)
      .setLabel(`تأكيد الحذف (${matched.length})`)
      .setStyle(ButtonStyle.Danger);

    const cancelBtn = new ButtonBuilder()
      .setCustomId(`cleanup_welcome:cancel:${sessionId}`)
      .setLabel("إلغاء")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

    return interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }
};
