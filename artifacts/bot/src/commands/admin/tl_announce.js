import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("tl_announce")
  .setDescription("إرسال إعلان عام لـ Throne and Liberty")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option =>
    option.setName("type")
      .setDescription("نوع الإعلان")
      .setRequired(true)
      .addChoices(
        { name: "أخبار (News)", value: "news" },
        { name: "شأن داخلي (Internal Affairs)", value: "internal" },
        { name: "باتش نوت (Patch Notes)", value: "patch" }
      )
  )
  .addStringOption(option =>
    option.setName("description")
      .setDescription("محتوى الإعلان والوصف")
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option.setName("require_interaction")
      .setDescription("تفعيل زر (قرأت التنويه) لتسجيل الحضور")
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option.setName("dm_all")
      .setDescription("إرسال رسالة خاصة لجميع الأعضاء برابط الإعلان (مهم جداً)")
      .setRequired(false)
  )
  .addAttachmentOption(option =>
    option.setName("image")
      .setDescription("صورة مرفقة للإعلان (اختياري)")
      .setRequired(false)
  );

export async function execute(interaction) {
  const type = interaction.options.getString("type");
  const description = interaction.options.getString("description");
  const requireInteraction = interaction.options.getBoolean("require_interaction") || false;
  const dmAll = interaction.options.getBoolean("dm_all") || false;
  const imageAttachment = interaction.options.getAttachment("image");

  let title = "📢 إعلان Throne and Liberty";
  let color = "#3498DB";
  
  if (type === "news") { title = "📰 أخبار Throne and Liberty"; color = "#F1C40F"; }
  else if (type === "internal") { title = "🛡️ شأن داخلي (Guild Affairs)"; color = "#E74C3C"; }
  else if (type === "patch") { title = "⚙️ تحديثات وباتش نوت (Patch Notes)"; color = "#2ECC71"; }

  const channelId = "1417943141775835279"; // روم الاعلانات
  const channel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    return interaction.reply({ content: "❌ لم أتمكن من العثور على روم الإعلانات المخصص (`1417943141775835279`).", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  let finalDescription = description;
  if (requireInteraction) {
    finalDescription += `\n\n**⚠️ تنويه:**\nإذا قرأت التنويه أرجو منك التفاعل مع الزر بالأسفل ليتم تسجيل اسمك.`;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(finalDescription)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: `المرسل: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  if (imageAttachment) {
    embed.setImage(imageAttachment.url);
  }

  const payload = { embeds: [embed] };

  if (requireInteraction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("tl:announce:read")
        .setLabel("✅ قرأت التنويه")
        .setStyle(ButtonStyle.Success)
    );
    payload.components = [row];
  }

  try {
    const sentMessage = await channel.send(payload);
    let dmReport = "";

    if (dmAll) {
      const roleId = "1292754458492796982"; // TL_MEMBER_ROLE_ID
      const tlRole = await interaction.guild.roles.fetch(roleId).catch(() => null);
      
      if (tlRole) {
        // Fetch all members if not fully cached
        await interaction.guild.members.fetch().catch(() => null);
        let successCount = 0;
        let failCount = 0;
        
        for (const [memberId, member] of tlRole.members) {
          if (!member.user.bot) {
            try {
              await member.send(`🔔 **يوجد تنبيه أو إعلان جديد ومهم لجيلد Throne and Liberty!**\nالرجاء التوجه للروم وقراءته من هذا الرابط:\n${sentMessage.url}`);
              successCount++;
            } catch (err) {
              failCount++;
            }
          }
        }
        dmReport = `\n📨 تم إرسال رسالة التنبيه لـ **${successCount}** لاعب. (${failCount} مقفلين الخاص)`;
      } else {
        dmReport = `\n⚠️ لم أتمكن من العثور على رتبة TL لإرسال الـ DM.`;
      }
    }

    await interaction.editReply(`✅ تم نشر الإعلان بنجاح في روم التنبيهات! [اضغط هنا لرؤيته](${sentMessage.url})${dmReport}`);
  } catch (error) {
    console.error("[Announce] Error sending announcement:", error);
    await interaction.editReply(`❌ حدث خطأ أثناء إرسال الإعلان: ${error.message}`);
  }
}
