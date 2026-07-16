import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("publish_overlay")
  .setDescription("نشر تطبيق الإشعارات (Overlay) في الروم المخصص مع تثبيت الرسالة")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(option => 
    option.setName("github_link")
      .setDescription("رابط تحميل التطبيق من GitHub")
      .setRequired(true)
  )
  .addStringOption(option => 
    option.setName("version")
      .setDescription("رقم الإصدار (مثال: v1.0.0)")
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const githubLink = interaction.options.getString("github_link");
  const version = interaction.options.getString("version") || "الإصدار الأول";
  const channelId = "1527143330788409465";

  try {
    const targetChannel = await interaction.client.channels.fetch(channelId);
    
    if (!targetChannel) {
      return interaction.editReply("❌ لم أتمكن من العثور على الروم المخصص، تأكد من أن البوت لديه صلاحيات هناك.");
    }

    const embed = new EmbedBuilder()
      .setTitle("🎮 M3RGEEN Overlay App | تطبيق إشعارات الشاشة")
      .setDescription("أهلاً بالجميع! تم إطلاق تطبيق (Overlay) الخاص بالسيرفر. التطبيق يظهر الإشعارات مباشرة على شاشتك فوق اللعبة لتتابع أوقات الزعماء والفعاليات بشكل مريح وبدون الحاجة لفتح الديسكورد! 🌌\n\n⚠️ **تعليمات هامة جداً:**\nيجب تشغيل هذا البرنامج دائماً مع اللعبة لضمان وصول التنبيهات الإدارية الطارئة والمهمة الخاصة بالقيلد (Guild)، بالإضافة إلى تنبيهات اللعبة الرسمية (المعلنة والمخفية). لا تفوت أي حدث أو استدعاء من الإدارة!")
      .addFields(
        { name: "✨ المميزات الرئيسية:", value: "• 🔔 إشعارات شفافة ومنبثقة وقت الحدث.\n• ⚡ مزامنة دقيقة 100% مع أوقات البوت.\n• 💻 خفيف جداً ولا يستهلك من أداء الجهاز." },
        { name: "🛠️ الإصدار الحالي:", value: `\`${version}\``, inline: true }
      )
      .setColor(0x9b59b6) // Elegant purple
      .setThumbnail(interaction.client.user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: "برمجة وتطوير حصري لسيرفر M3RGEEN", iconURL: interaction.client.user.displayAvatarURL() })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("تحميل البرنامج من GitHub")
        .setURL(githubLink)
        .setStyle(ButtonStyle.Link)
        .setEmoji("📥")
    );

    const message = await targetChannel.send({ embeds: [embed], components: [row] });
    
    // محاولة تثبيت الرسالة
    try {
      await message.pin();
    } catch (pinErr) {
      console.error("[Publish Overlay] Could not pin the message:", pinErr);
    }

    await interaction.editReply(`✅ تم نشر التطبيق بنجاح وتثبيته في الروم <#${channelId}>!`);
  } catch (error) {
    console.error("[Publish Overlay] Error executing command:", error);
    await interaction.editReply("❌ حدث خطأ أثناء نشر التطبيق، قد يكون بسبب صلاحيات الروم أو خطأ غير متوقع.");
  }
}
