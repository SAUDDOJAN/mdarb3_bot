import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType 
} from "discord.js";
import { createBroadcastAlert, publishOverlayEvent } from "../../database/index.js";
import { emitNotification } from "../../socket.js";

const TYPE_CONFIG = {
  alert: {
    name: "تنبيه مهم",
    badge: "🔔 تنبيه مهم",
    color: 0xF1C40F, // Gold / Yellow
    header: "تنبيه إداري من مجتمع M3RGEEN"
  },
  news: {
    name: "خبر عاجل",
    badge: "📰 خبر عاجل",
    color: 0x3498DB, // Blue
    header: "أخبار مجتمع M3RGEEN"
  },
  warning: {
    name: "تحذير مهم",
    badge: "⚠️ تحذير مهم",
    color: 0xE74C3C, // Red
    header: "تحذير عاجل لجميع الأعضاء"
  },
  update: {
    name: "تحديث جديد",
    badge: "🚀 تحديث جديد",
    color: 0x9B59B6, // Purple
    header: "تحديث جديد لتطبيق M3RGEEN"
  }
};

export const data = new SlashCommandBuilder()
  .setName("app_alert")
  .setDescription("إرسال تنبيه أو خبر أو تحذير أو تحديث فوري لتطبيق M3RGEEN وروم الديسكورد")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option =>
    option
      .setName("type")
      .setDescription("نوع التنبيه")
      .setRequired(true)
      .addChoices(
        { name: "🔔 تنبيه (Alert)", value: "alert" },
        { name: "📰 خبر (News)", value: "news" },
        { name: "⚠️ تحذير (Warning)", value: "warning" },
        { name: "🚀 تحديث (Update)", value: "update" }
      )
  )
  .addStringOption(option =>
    option
      .setName("title")
      .setDescription("عنوان التنبيه أو الخبر (يظهر في البانر والميني والإشعارات)")
      .setRequired(true)
      .setMaxLength(100)
  )
  .addStringOption(option =>
    option
      .setName("message")
      .setDescription("نص وتفاصيل الخبر أو التنبيه")
      .setRequired(true)
      .setMaxLength(4000)
  )
  .addIntegerOption(option =>
    option
      .setName("duration")
      .setDescription("مدة بقاء التنبيه في البانر والميني بالدقائق (افتراضياً 60 دقيقة)")
      .setRequired(false)
      .addChoices(
        { name: "15 دقيقة", value: 15 },
        { name: "30 دقيقة", value: 30 },
        { name: "ساعة واحدة (60 دقيقة - افتراضي)", value: 60 },
        { name: "ساعتان (120 دقيقة)", value: 120 },
        { name: "6 ساعات (360 دقيقة)", value: 360 },
        { name: "24 ساعة (يوم كامل)", value: 1440 }
      )
  )
  .addChannelOption(option =>
    option
      .setName("channel")
      .setDescription("القناة المراد إرسال الإعلان فيها (افتراضياً الروم الحالي، أو روم 1290056577856045127)")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName("mention")
      .setDescription("إرسال منشن في الروم مع الإعلان (اختياري)")
      .setRequired(false)
      .addChoices(
        { name: "بدون منشن", value: "none" },
        { name: "@everyone", value: "everyone" },
        { name: "@here", value: "here" },
        { name: "رتبة Aion 2 (@1401376073077231702)", value: "aion2" }
      )
  )
  .addAttachmentOption(option =>
    option
      .setName("image")
      .setDescription("صورة مرفقة مع الإعلان (اختياري)")
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName("image_url")
      .setDescription("رابط صورة خارجي للإعلان (اختياري)")
      .setRequired(false)
  );

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    console.error("[app_alert] deferReply failed:", err);
    return;
  }

  try {
    // 1. Permission verification
    const isStaff = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
                    interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    if (!isStaff) {
      return interaction.editReply({ content: "❌ عذراً، هذا الأمر مخصص لإدارة وقادة مجتمع M3RGEEN فقط." });
    }

    // 2. Read arguments
    const type = interaction.options.getString("type") || "alert";
    const title = interaction.options.getString("title").trim();
    const message = interaction.options.getString("message").trim();
    const durationMinutes = interaction.options.getInteger("duration") || 60;
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
    const mentionType = interaction.options.getString("mention") || "none";
    const imageAttachment = interaction.options.getAttachment("image");
    const imageUrl = interaction.options.getString("image_url");

    if (!targetChannel || !targetChannel.isTextBased()) {
      return interaction.editReply({ content: "❌ القناة المحددة غير صالحة لإرسال الرسائل." });
    }

    const typeConfig = TYPE_CONFIG[type] || TYPE_CONFIG.alert;
    const finalImageUrl = imageAttachment ? imageAttachment.url : (imageUrl || null);
    const authorName = interaction.member?.displayName || interaction.user.username;

    // 3. Build Rich Discord Embed
    const embed = new EmbedBuilder()
      .setColor(typeConfig.color)
      .setAuthor({
        name: typeConfig.header,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTitle(`${typeConfig.badge} | ${title}`)
      .setDescription(message)
      .addFields(
        {
          name: "📱 تطبيق M3RGEEN Companion (Overlay)",
          value: "✅ تم إرسال هذا التنبيه مباشرة لشاشات اللاعبين في البرنامج المكتبي.",
          inline: false
        },
        {
          name: "⏰ مدة الظهور بالبرنامج",
          value: `\`${durationMinutes}\` دقيقة`,
          inline: true
        },
        {
          name: "👤 بواسطة",
          value: `<@${interaction.user.id}>`,
          inline: true
        },
        {
          name: "📍 الروم",
          value: `<#${targetChannel.id}>`,
          inline: true
        }
      )
      .setThumbnail(interaction.client.user.displayAvatarURL({ size: 256 }))
      .setFooter({
        text: "M3RGEEN Community • تنبيه فوري متزامن مع البرنامج",
        iconURL: interaction.guild?.iconURL() || interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    if (finalImageUrl) {
      embed.setImage(finalImageUrl);
    }

    // Mention handling
    let mentionContent = null;
    let allowedMentions = { parse: [] };
    if (mentionType === "everyone") {
      mentionContent = "@everyone";
      allowedMentions = { parse: ["everyone"] };
    } else if (mentionType === "here") {
      mentionContent = "@here";
      allowedMentions = { parse: ["everyone"] };
    } else if (mentionType === "aion2") {
      mentionContent = "<@&1401376073077231702>";
      allowedMentions = { roles: ["1401376073077231702"] };
    }

    // 4. Send Message to Discord Channel
    const sendPayload = { embeds: [embed] };
    if (mentionContent) {
      sendPayload.content = mentionContent;
      sendPayload.allowedMentions = allowedMentions;
    }

    const sentMessage = await targetChannel.send(sendPayload);

    // Direct Discord Message URL
    const messageUrl = `https://discord.com/channels/${interaction.guildId}/${targetChannel.id}/${sentMessage.id}`;

    // Add button link to the message
    try {
      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("رابط الخبر في ديسكورد")
          .setStyle(ButtonStyle.Link)
          .setURL(messageUrl)
          .setEmoji("🔗")
      );
      await sentMessage.edit({ components: [buttonRow] });
    } catch (btnErr) {
      console.warn("[app_alert] Failed to add link button to sent message:", btnErr.message);
    }

    // 5. Save to Database (app_broadcasts)
    let savedBroadcast = null;
    try {
      savedBroadcast = await createBroadcastAlert({
        type,
        title,
        message,
        link: messageUrl,
        channelId: targetChannel.id,
        channelName: targetChannel.name,
        messageId: sentMessage.id,
        authorId: interaction.user.id,
        authorName,
        durationMinutes
      });
    } catch (dbErr) {
      console.error("[app_alert] DB save error:", dbErr);
    }

    // 6. Broadcast via Socket.IO to connected desktop clients in real-time
    const broadcastPayload = {
      id: savedBroadcast ? savedBroadcast.id : Date.now(),
      type,
      title,
      message,
      link: messageUrl,
      channel_id: targetChannel.id,
      channel_name: targetChannel.name,
      author_id: interaction.user.id,
      author_name: authorName,
      duration_minutes: durationMinutes,
      active_until: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString(),
      created_at: new Date().toISOString()
    };

    emitNotification({
      type: "app_broadcast",
      broadcast: broadcastPayload
    });

    // 7. Backward compatibility trigger for Postgres NOTIFY
    try {
      await publishOverlayEvent("broadcast", `تنبيه مهم: ${title}`, finalImageUrl, durationMinutes);
    } catch (e) {}

    // 8. Confirm to Moderator
    return interaction.editReply({
      content: `✅ **تم إرسال التنبيه ونشره بنجاح!**\n\n` +
               `📢 **الروم المستهدف:** <#${targetChannel.id}>\n` +
               `🏷️ **النوع:** ${typeConfig.badge}\n` +
               `📌 **العنوان:** **${title}**\n` +
               `⏱️ **مدة الظهور في البرنامج (البانر & الميني):** ${durationMinutes} دقيقة\n` +
               `🔗 **رابط الخبر المباشر:** ${messageUrl}`
    });

  } catch (err) {
    console.error("[app_alert] Command execution error:", err);
    return interaction.editReply({
      content: `❌ حدث خطأ أثناء تنفيذ الأمر: ${err.message || "خطأ غير متوقع"}. تأكد من صلاحيات البوت في القناة.`
    });
  }
}

export default {
  data,
  execute
};
