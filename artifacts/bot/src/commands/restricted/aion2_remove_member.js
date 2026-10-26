import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { query } from "../../database/index.js";
import { triggerRemovalAnnouncement } from "../../tasks/aion2Announcer.js";

const AION2_MEMBER_ROLE_ID = "1401376073077231702";

export default {
  data: new SlashCommandBuilder()
    .setName("aion2_remove_member")
    .setDescription("إزالة عضو أو إعادة تعيين حسابه في نظام AION 2 بالكامل")
    .addUserOption(option => 
      option.setName("user")
        .setDescription("عضو الديسكورد المستهدف")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("mode")
        .setDescription("نوع العملية: إزالة من الروستر أو إعادة ضبط شاملة (للاختبارات)")
        .setRequired(false)
        .addChoices(
          { name: "إزالة عادية من الروستر (Remove)", value: "REMOVE" },
          { name: "إعادة ضبط شاملة من الصفر (Full Reset / Test Clean)", value: "FULL_RESET" }
        )
    )
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("سبب الإزالة أو إعادة الضبط")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ عذراً، هذا الأمر مخصص للإدارة العليا فقط.", ephemeral: true });
    }

    const targetUser = interaction.options.getUser("user");
    const mode = interaction.options.getString("mode") || "REMOVE";
    const reason = interaction.options.getString("reason") || "غير محدد";

    // ─────────────────────────────────────────────────────────────
    // MODE: FULL_RESET (Test accounts & complete clean-up)
    // ─────────────────────────────────────────────────────────────
    if (mode === "FULL_RESET") {
      const allApps = await query(`
        SELECT id, status, guild_type, selected_class, character_name 
        FROM aion2_global_applications 
        WHERE discord_id = $1
        ORDER BY id DESC
      `, [targetUser.id]);

      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("⚠️ تأكيد إعادة الضبط الكاملة (FULL RESET)")
        .setDescription(
          `⚠️ **تحذير إداري: أنت على وشك إعادة ضبط العضو بشكل كامل في نظام AION 2!**\n\n` +
          `👤 **العضو:** <@${targetUser.id}>\n` +
          `🆔 **Discord ID:** \`${targetUser.id}\`\n` +
          `📋 **عدد استمارات التسجيل المسجلة:** ${allApps.rowCount}\n` +
          `📝 **السبب:** ${reason}\n\n` +
          `**الإجراءات التي ستُنفذ عند التأكيد:**\n` +
          `1. حذف **كافة استمارات وتسجيلات AION 2** الخاصة بالعضو نهائياً من قاعدة البيانات.\n` +
          `2. سحب **جميع رتب AION 2** (Member, Early Access, Emperor, M3RGEEN Guild).\n` +
          `3. إعادة ضبط **الاسم المستعار (Server Nickname)** إلى اسمه الأصلي.\n` +
          `4. إغلاق وتحرير أي **حالة LFG نشطة** أو أقفال معلقة للعضو.\n` +
          `5. **لن يتم حذف:** النقاط، سجل الـ Ledger، أو استبيانات الحضور التاريخية.\n\n` +
          `هل أنت متأكد من المتابعة؟`
        )
        .setFooter({ text: `Target User: ${targetUser.id} | Mode: FULL_RESET` });

      const confirmBtn = new ButtonBuilder()
        .setCustomId(`temp_aion2_fullreset_confirm_${targetUser.id}_${interaction.user.id}`)
        .setLabel("⚠️ تأكيد إعادة الضبط الكاملة")
        .setStyle(ButtonStyle.Danger);

      const cancelBtn = new ButtonBuilder()
        .setCustomId(`temp_aion2_remove_cancel_0_${interaction.user.id}`)
        .setLabel("إلغاء")
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // ─────────────────────────────────────────────────────────────
    // MODE: REMOVE (Standard roster removal)
    // ─────────────────────────────────────────────────────────────
    const appRes = await query(`
      SELECT id, status, guild_type, selected_class, character_name 
      FROM aion2_global_applications 
      WHERE discord_id = $1 AND status = 'ACCEPTED'
      ORDER BY id DESC
      LIMIT 1
    `, [targetUser.id]);

    if (appRes.rowCount === 0) {
      return interaction.reply({ 
        content: `❌ المستخدم <@${targetUser.id}> ليس لديه استمارة مقبولة في أي من روستر AION 2 حالياً.\n(إذا كنت تريد تصفير حساب اختبار حتى بدون قبول، استخدم خيار: \`mode: Full Reset\`).`, 
        ephemeral: true 
      });
    }

    const app = appRes.rows[0];
    const guildTypeName = app.guild_type === 'EARLY_ACCESS' ? 'Early Access' : 'Global';

    const embed = new EmbedBuilder()
      .setColor("#E74C3C")
      .setTitle("إزالة عضو من AION 2")
      .setDescription(
        `**العضو:** <@${targetUser.id}>\n` +
        `**Discord ID:** \`${targetUser.id}\`\n` +
        `**الشخصية:** ${app.character_name || "غير محدد"}\n` +
        `**الجيلد الحالي:** ${guildTypeName}\n` +
        `**الكلاس:** ${app.selected_class || "غير محدد"}\n` +
        `**السبب:** ${reason}\n\n` +
        `ℹ️ سيتم تحويل حالة السجل إلى \`REMOVED\` وتفريغ الجيلد المعين وسحب رتب AION 2 وإعادة اسمه المستعار، مع الحفاظ على سجله التاريخي ونقاطه.`
      )
      .setFooter({ text: `App ID: ${app.id} | Mode: REMOVE` });

    const gtCode = app.guild_type === 'EARLY_ACCESS' ? 'E' : 'G';

    const confirmBtn = new ButtonBuilder()
      .setCustomId(`temp_aion2_remove_confirm_${app.id}_${targetUser.id}_${gtCode}_${interaction.user.id}`)
      .setLabel("تأكيد الحذف")
      .setStyle(ButtonStyle.Danger);

    const cancelBtn = new ButtonBuilder()
      .setCustomId(`temp_aion2_remove_cancel_${app.id}_${interaction.user.id}`)
      .setLabel("إلغاء")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
};
