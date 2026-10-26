import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { query } from "../../database/index.js";
import {
  CONFIRMATION_CHANNEL_ID,
  buildPublicConfirmationEmbed,
  buildPublicConfirmationRow
} from "../../modules/aion2Confirmation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("aion2_confirmation_start")
    .setDescription("Start the 48-hour AION 2 roster confirmation campaign (Admin Only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ لا تملك صلاحية لاستخدام هذا الأمر.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // 1. Check if an active campaign already exists
    const checkActive = await query(`
      SELECT * FROM aion2_roster_confirmation_campaigns
      WHERE status = 'ACTIVE' AND ends_at > NOW()
      ORDER BY id DESC
      LIMIT 1
    `);

    if (checkActive.rowCount > 0) {
      const activeCamp = checkActive.rows[0];
      const endUnix = Math.floor(new Date(activeCamp.ends_at).getTime() / 1000);
      return interaction.editReply({
        content: `⚠️ توجد حملة تأكيد نشطة بالفعل تنتهي <t:${endUnix}:R>. لا يمكن بدء حملة جديدة قبل انتهاء الحملة الحالية.`
      });
    }

    // 2. Fetch target channel
    const channel = interaction.client.channels.cache.get(CONFIRMATION_CHANNEL_ID)
      || await interaction.client.channels.fetch(CONFIRMATION_CHANNEL_ID).catch(() => null);

    if (!channel) {
      return interaction.editReply({
        content: `❌ تعذر العثور على روم التأكيد (ID: ${CONFIRMATION_CHANNEL_ID}). تأكد من الصلاحيات ووجود الروم.`
      });
    }

    // 3. Count current eligible members
    const eligibleRes = await query(`
      SELECT COUNT(*) as count
      FROM aion2_global_applications
      WHERE status = 'ACCEPTED'
        AND transition_status IS NULL
        AND guild_type IN ('GLOBAL', 'EARLY_ACCESS')
    `);
    const totalEligible = parseInt(eligibleRes.rows[0].count, 10);

    // 4. Temporary campaign object for rendering the initial embed (starts exactly now, ends in 48 hours)
    const endsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const tempCampaign = { ends_at: endsAt };

    const embed = buildPublicConfirmationEmbed(tempCampaign, 0, totalEligible);
    const row = buildPublicConfirmationRow(false);

    // 5. Post to Discord with NO mentions
    let message;
    try {
      message = await channel.send({
        embeds: [embed],
        components: [row],
        allowedMentions: { parse: [] } // STRICTLY NO MENTIONS
      });
    } catch (err) {
      console.error("[Confirmation] Failed to publish campaign embed to Discord:", err);
      return interaction.editReply({
        content: `❌ فشل إرسال رسالة الحملة إلى الديسكورد: ${err.message}`
      });
    }

    // 6. Only persist campaign in DB if Discord message was published successfully
    try {
      const insertRes = await query(`
        INSERT INTO aion2_roster_confirmation_campaigns (channel_id, message_id, status, started_at, ends_at, created_by)
        VALUES ($1, $2, 'ACTIVE', NOW(), NOW() + INTERVAL '48 hours', $3)
        RETURNING *
      `, [CONFIRMATION_CHANNEL_ID, message.id, interaction.user.id]);

      const campaign = insertRes.rows[0];
      const endUnix = Math.floor(new Date(campaign.ends_at).getTime() / 1000);

      await interaction.editReply({
        content: `✅ **تم إطلاق حملة تأكيد الاستمرار بنجاح!**\n\n📌 **الروم:** <#${CONFIRMATION_CHANNEL_ID}>\n🆔 **معرف الحملة:** ${campaign.id}\n⏰ **تنتهي:** <t:${endUnix}:R> (<t:${endUnix}:F>)\n👥 **المستهدفون حالياً:** ${totalEligible} لاعب.`
      });
    } catch (dbErr) {
      console.error("[Confirmation] Failed to persist campaign record to DB:", dbErr);
      // Attempt to delete orphaned Discord message
      await message.delete().catch(() => {});
      return interaction.editReply({
        content: `❌ فشل تسجيل الحملة في قاعدة البيانات: ${dbErr.message}`
      });
    }
  }
};
