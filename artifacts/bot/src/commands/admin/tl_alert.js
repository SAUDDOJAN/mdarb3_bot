import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { publishOverlayEvent } from "../../database/index.js";

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
        { name: "Calanthia Raid (ريد كلنثيا)", value: "calanthia_raid" },
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
  )
  .addBooleanOption(option =>
    option.setName("send_dm")
      .setDescription("إرسال رسائل خاصة بالحدث لأعضاء رتبة TL Guild؟")
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const type = interaction.options.getString("type");
  const description = interaction.options.getString("description");
  const customTitle = interaction.options.getString("custom_title");
  const imageAttachment = interaction.options.getAttachment("image");
  const sendDm = interaction.options.getBoolean("send_dm") || false;

  let title = "";
  if (type === "guild_raid") title = "📢 Guild Raid";
  else if (type === "calanthia_raid") title = "📢 ريد كلنثيا (Calanthia Raid)";
  else if (type === "nix") title = "📢 فارم Remnant of NIX";
  else title = customTitle ? `📢 ${customTitle}` : "📢 إعلان Throne and Liberty";

  let channelId = "1526297989734334554";
  if (type === "guild_raid") channelId = "1526362737884795011";
  else if (type === "calanthia_raid") channelId = "1294312574162178200";
  
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
  } else if (type === "calanthia_raid") {
    embed.setImage("https://cdn.discordapp.com/attachments/1290449971639881849/1528383932264087662/Calanthia_-_768.png?ex=6a5e19f5&is=6a5cc875&hm=19e7544c9e9f4188271b0b5118d2ee8939c377d1e01a89d133150f34fc387bbe&");
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
        .setEmoji("📋"),
      new ButtonBuilder()
        .setCustomId("throne:raid_start")
        .setLabel("بدء الريد (إغلاق التسجيل)")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒")
    );
    payload.components = [row];
  } else if (type === "calanthia_raid") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("throne:calanthia_raid_join")
        .setLabel("أرغب بالانضمام (التسجيل مفتوح)")
        .setStyle(ButtonStyle.Success)
        .setEmoji("⚔️"),
      new ButtonBuilder()
        .setCustomId("throne:calanthia_raid_view")
        .setLabel("عرض الأوقات المسجلة")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📋"),
      new ButtonBuilder()
        .setCustomId("throne:calanthia_raid_start")
        .setLabel("بدء الريد (إغلاق التسجيل)")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒")
    );
    payload.components = [row];
  }

  await channel.send(payload);

  if (type === "guild_raid" || type === "calanthia_raid") {
    const imgUrl = imageAttachment ? imageAttachment.url : (type === "calanthia_raid" ? "https://cdn.discordapp.com/attachments/1290449971639881849/1528383932264087662/Calanthia_-_768.png?ex=6a5e19f5&is=6a5cc875&hm=19e7544c9e9f4188271b0b5118d2ee8939c377d1e01a89d133150f34fc387bbe&" : null);
    await publishOverlayEvent(type === "guild_raid" ? "Guild Raid" : "Calanthia Raid", "الجيلد يستعد لريد، التسجيل مفتوح بالديسكورد", imgUrl, null);

    if (sendDm) {
      const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'tl guild');
      if (role) {
        await interaction.editReply({ content: "⏳ جاري إرسال الرسائل الخاصة للأعضاء، الرجاء الانتظار..." });
        
        // Members might need to be fetched if they are not all cached
        await interaction.guild.members.fetch();
        const members = role.members;
        
        let successCount = 0;
        let failCount = 0;
        
        for (const [id, member] of members) {
          if (member.user.bot) continue;
          try {
            await member.send({ content: `🔔 **تنبيه إدارة القيلد (${type === "guild_raid" ? "Guild Raid" : "Calanthia Raid"})!**\n\n${description}\n\n*الرجاء التوجه لروم الديسكورد للتسجيل!*` });
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 seconds delay to prevent rate limit
          } catch (e) {
            failCount++;
          }
        }
        await interaction.followUp({ content: `✅ انتهى إرسال الـ DM! نجح: ${successCount}، فشل: ${failCount} (ربما مقفلين الخاص).`, ephemeral: true });
      } else {
        await interaction.followUp({ content: "⚠️ لم أتمكن من العثور على رتبة باسم TL Guild لإرسال الـ DM.", ephemeral: true });
      }
    }
  }

  await interaction.editReply({ content: "✅ تم إرسال التنبيه إلى الروم بنجاح!" });
}
