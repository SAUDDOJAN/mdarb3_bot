import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ChannelType } from "discord.js";
import path from "path";
import fs from "fs";

export default {
  data: new SlashCommandBuilder()
    .setName("temp_aion2_announce")
    .setDescription("إرسال إعلان فتح التسجيل لـ AION 2 (للإدارة فقط)")
    .addChannelOption(option => 
      option.setName("channel")
        .setDescription("الروم الذي تريد إرسال الإعلان إليه (اختياري - افتراضيا روم الإعلانات الرسمي)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),
  async execute(interaction) {
    if (!interaction.member.permissions.has("Administrator")) {
      return interaction.reply({ content: "❌ لا تملك صلاحية لاستخدام هذا الأمر.", flags: 64 });
    }

    await interaction.deferReply({ ephemeral: true });

    const targetChannel = interaction.options.getChannel("channel") || await interaction.client.channels.fetch("1290056577856045127").catch(() => null);

    if (!targetChannel) {
      return interaction.editReply({ content: "❌ لم أتمكن من العثور على الروم." });
    }

    const imagePath = path.resolve(process.cwd(), "assets", "aion2_announce.jpg");
    const files = [];
    let imageAttachment = null;
    
    if (fs.existsSync(imagePath)) {
      imageAttachment = new AttachmentBuilder(imagePath, { name: "aion2_announce.jpg" });
      files.push(imageAttachment);
    }

    const embed = new EmbedBuilder()
      .setColor("#2f3136")
      .setTitle("🪽 فتح التسجيل | AION 2")
      .setDescription("تم فتح التسجيل رسميًا لقيلد M3RGEEN.\n\nالتسجيل متاح الآن، واختيار الكلاس في الطلب مهم لأنه سيكون الكلاس الأساسي المعتمد لك داخل القيلد.\n\n⚠️ اختر الكلاس الذي ستلعب به بشكل أساسي، وليس Alt أو كلاس مؤقت.")
      .addFields(
        { name: "👥 عدد المقاعد", value: "الحد الأقصى للقيلد: **128 لاعب فقط**\n\nبعض الكلاسات لها عدد مقاعد محدد حسب احتياج القيلد، لذلك يفضّل التسجيل مبكرًا.", inline: false },
        { name: "🎯 مقاعد الكلاسات المحددة", value: "• **Cleric:** 10 مقاعد\n• **Templar:** 10 مقاعد\n• **Assassin:** 15 مقعد\n• **Ranger:** 15 مقعد\n\n*(باقي الكلاسات متاحة بدون حد مخصص حالياً، لكنها محسوبة ضمن السعة الإجمالية 128)*", inline: false },
        { name: "📋 طريقة التسجيل", value: "ادخل قسم **AION 2** في السيرفر، اقرأ القوانين، ثم قدّم طلب الانضمام وسيتم مراجعته من الإدارة.", inline: false },
        { name: "🔗 رابط الانضمام", value: "https://discord.com/channels/861355983975874601/1548356201157369948", inline: false }
      )
      .setFooter({ text: "M3RGEEN • AION 2 Global" });

    if (imageAttachment) {
      embed.setImage("attachment://aion2_announce.jpg");
    }

    try {
      await targetChannel.send({ content: "@everyone", embeds: [embed], files });
      await interaction.editReply({ content: `✅ تم إرسال الإعلان بنجاح إلى ${targetChannel}` });
    } catch (e) {
      console.error(e);
      await interaction.editReply({ content: "❌ حدث خطأ أثناء إرسال الإعلان. تأكد من صلاحيات البوت في هذا الروم." });
    }
  }
};
