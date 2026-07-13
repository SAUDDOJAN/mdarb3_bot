import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("tl_alert")
  .setDescription("إرسال تنبيه مخصص لروم إشعارات Throne and Liberty")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option =>
    option.setName("type")
      .setDescription("نوع التنبيه")
      .setRequired(true)
      .addChoices(
        { name: "Guild Raid (بوس القيلد)", value: "guild_raid" },
        { name: "Remnant of NIX (فارم نيكس)", value: "nix" },
        { name: "مخصص (Custom)", value: "custom" }
      )
  )
  .addStringOption(option =>
    option.setName("description")
      .setDescription("وصف الحدث أو التنبيه")
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName("custom_title")
      .setDescription("عنوان مخصص (فقط إذا اخترت نوع مخصص)")
      .setRequired(false)
  )
  .addAttachmentOption(option =>
    option.setName("image")
      .setDescription("صورة مرفقة للتنبيه (يمكنك لصق الصورة هنا)")
      .setRequired(false)
  );

export async function execute(interaction) {
  const type = interaction.options.getString("type");
  const description = interaction.options.getString("description");
  const customTitle = interaction.options.getString("custom_title");
  const imageAttachment = interaction.options.getAttachment("image");

  let title = "";
  if (type === "guild_raid") title = "📢 Guild Raid";
  else if (type === "nix") title = "📢 فارم Remnant of NIX";
  else title = customTitle ? `📢 ${customTitle}` : "📢 إعلان Throne and Liberty";

  let channelId = "1526297989734334554";
  if (type === "guild_raid") channelId = "1526362737884795011";
  
  const roleId = "1292754458492796982";

  const channel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
  
  if (!channel) {
    return interaction.reply({ content: "❌ لم أتمكن من العثور على روم التنبيهات المخصص.", ephemeral: true });
  }

  let finalDescription = description;
  if (type === "guild_raid") {
    const d = new Date();
    let daysUntilThursday = 4 - d.getUTCDay();
    if (daysUntilThursday < 0 || (daysUntilThursday === 0 && d.getUTCHours() >= 11)) {
      daysUntilThursday += 7;
    }
    const deadline = new Date(d);
    deadline.setUTCDate(deadline.getUTCDate() + daysUntilThursday);
    deadline.setUTCHours(11, 0, 0, 0);
    const unixTime = Math.floor(deadline.getTime() / 1000);
    
    finalDescription += `\n\n⏳ **يغلق التسجيل:** <t:${unixTime}:R> (<t:${unixTime}:f>)`;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(finalDescription)
    .setColor("#E74C3C")
    .setTimestamp()
    .setFooter({ text: `مرسل التنبيه: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  if (imageAttachment) {
    embed.setImage(imageAttachment.url);
  }

  const payload = {
    content: `<@&${roleId}>`,
    embeds: [embed]
  };

  if (type === "guild_raid") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("throne:raid_join")
        .setLabel("أرغب بالانضمام معكم (مطلوب تسجيل الوقت)")
        .setStyle(ButtonStyle.Success)
        .setEmoji("⚔️"),
      new ButtonBuilder()
        .setCustomId("throne:raid_view")
        .setLabel("عرض الأوقات المسجلة")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📋")
    );
    payload.components = [row];
  }

  await channel.send(payload);
  await interaction.reply({ content: "✅ تم إرسال التنبيه إلى روم الإشعارات بنجاح!", ephemeral: true });
}
