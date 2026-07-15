import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { publishOverlayEvent } from "../../database/index.js";

export const data = new SlashCommandBuilder()
  .setName("overlay_event")
  .setDescription("إرسال حدث مخصص لتطبيق الويندوز (Overlay)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option =>
    option.setName("event_name")
      .setDescription("اسم الحدث (مثال: Raid Boss, اجتماع...)")
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName("timer_minutes")
      .setDescription("مدة المؤقت بالدقائق")
      .setRequired(true)
  )
  .addAttachmentOption(option =>
    option.setName("image")
      .setDescription("صورة الحدث (اختياري)")
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName("image_url")
      .setDescription("رابط لصورة الحدث بدلاً من رفع ملف (اختياري)")
      .setRequired(false)
  );

export async function execute(interaction) {
  const eventName = interaction.options.getString("event_name");
  const timerMinutes = interaction.options.getInteger("timer_minutes");
  const imageAttachment = interaction.options.getAttachment("image");
  const imageUrl = interaction.options.getString("image_url");

  let finalImageUrl = null;
  if (imageAttachment) {
    finalImageUrl = imageAttachment.url;
  } else if (imageUrl) {
    finalImageUrl = imageUrl;
  }

  await publishOverlayEvent("custom", eventName, finalImageUrl, timerMinutes);

  await interaction.reply({
    content: `✅ تم إرسال الحدث بنجاح لتطبيق الـ Overlay!\n**الاسم:** ${eventName}\n**المؤقت:** ${timerMinutes} دقيقة`,
    ephemeral: true
  });
}
