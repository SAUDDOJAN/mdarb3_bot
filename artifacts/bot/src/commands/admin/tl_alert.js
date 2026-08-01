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
        { name: "Guild Archboss (راموكس)", value: "archboss_raid" },
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
    option.setName("date")
      .setDescription("تاريخ الريد (مثال: 2024-12-30)")
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName("time")
      .setDescription("وقت الريد بتوقيت مكة - 24 ساعة (مثال: 20:30)")
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
  const dateStr = interaction.options.getString("date");
  const timeStr = interaction.options.getString("time");
  const customTitle = interaction.options.getString("custom_title");
  const imageAttachment = interaction.options.getAttachment("image");
  const sendDm = interaction.options.getBoolean("send_dm") || false;

  let title = "";
  if (type === "guild_raid") title = "📢 Guild Raid";
  else if (type === "calanthia_raid") title = "📢 ريد كلنثيا (Calanthia Raid)";
  else if (type === "archboss_raid") title = "📢 Guild Archboss (Ramux)";
  else if (type === "nix") title = "📢 فارم Remnant of NIX";
  else title = customTitle ? `📢 ${customTitle}` : "📢 إعلان Throne and Liberty";

  let channelId = "1526297989734334554";
  if (type === "guild_raid" || type === "calanthia_raid" || type === "archboss_raid") channelId = "1526362737884795011";
  
  const roleId = "1292754458492796982";

  const channel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
  
  if (!channel) {
    return interaction.editReply({ content: "❌ لم أتمكن من العثور على روم التنبيهات المخصص." });
  }

  const raidTime = new Date(`${dateStr}T${timeStr}:00+03:00`);
  if (isNaN(raidTime.getTime())) {
    return interaction.editReply({ content: "❌ صيغة التاريخ أو الوقت غير صحيحة. يرجى استخدام الصيغة الصحيحة (مثال: التاريخ 2024-12-30 والوقت 20:30)." });
  }
  const unixTime = Math.floor(raidTime.getTime() / 1000);

  let finalDescription = description + `\n\n⏰ **موعد الحدث:** <t:${unixTime}:F>\n⏳ **يبدأ بعد:** <t:${unixTime}:R>`;

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
  } else if (type === "archboss_raid") {
    // We don't have a default image for Archboss yet, so we leave it empty if none provided.
  }

  const payload = {
    content: `<@&${roleId}>`,
    embeds: [embed]
  };

  if (type === "guild_raid" || type === "calanthia_raid" || type === "archboss_raid") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`throne:ur_status:yes`)
        .setLabel("بحضر")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`throne:ur_status:maybe`)
        .setLabel("يمكن أحضر")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔄"),
      new ButtonBuilder()
        .setCustomId(`throne:ur_status:no`)
        .setLabel("ماراح أقدر أحضر")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌"),
      new ButtonBuilder()
        .setCustomId(`throne:ur_view`)
        .setLabel("عرض المسجلين")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📋")
    );
    payload.components = [row];
  }

  const sentMessage = await channel.send(payload);

  if (type === "guild_raid" || type === "calanthia_raid" || type === "archboss_raid") {
    const imgUrl = imageAttachment ? imageAttachment.url : (type === "calanthia_raid" ? "https://cdn.discordapp.com/attachments/1290449971639881849/1528383932264087662/Calanthia_-_768.png?ex=6a5e19f5&is=6a5cc875&hm=19e7544c9e9f4188271b0b5118d2ee8939c377d1e01a89d133150f34fc387bbe&" : null);
    
    let overlayName = "Guild Raid";
    if (type === "calanthia_raid") overlayName = "Calanthia Raid";
    else if (type === "archboss_raid") overlayName = "Guild Archboss";

    await publishOverlayEvent(overlayName, "الجيلد يستعد لريد، التسجيل مفتوح بالديسكورد", imgUrl, null);

    const { query } = await import("../../database/index.js");
    await query(
      `INSERT INTO tl_raids_events (message_id, channel_id, raid_type, title, image_url, raid_time)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sentMessage.id, channelId, type, title, imgUrl, raidTime.toISOString()]
    ).catch(err => console.error("[tl_alert] Error saving raid event:", err));

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
            const raidName = type === "guild_raid" ? "Guild Raid" : (type === "archboss_raid" ? "Guild Archboss (Ramux)" : "Calanthia Raid");
            await member.send({ content: `🔔 **تنبيه إدارة القيلد (${raidName})!**\n\n${description}\n\n🔗 **[اضغط هنا للتوجه إلى الإعلان والتسجيل مباشرة](${sentMessage.url})**` });
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
