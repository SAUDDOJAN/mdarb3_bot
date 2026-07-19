import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { saveTlSchedule, getTlSchedule } from "../../database/index.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const data = new SlashCommandBuilder()
  .setName("tl_arc_sync")
  .setDescription("رفع صور جدول الأيام (Daily Tab) ليتم استخراج زعماء الآرك أسبوعياً عبر الذكاء الاصطناعي")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addAttachmentOption(option => option.setName("image1").setDescription("الصورة الأولى للجدول").setRequired(true))
  .addAttachmentOption(option => option.setName("image2").setDescription("الصورة الثانية (اختياري)").setRequired(false))
  .addAttachmentOption(option => option.setName("image3").setDescription("الصورة الثالثة (اختياري)").setRequired(false))
  .addAttachmentOption(option => option.setName("image4").setDescription("الصورة الرابعة (اختياري)").setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const images = [
    interaction.options.getAttachment("image1"),
    interaction.options.getAttachment("image2"),
    interaction.options.getAttachment("image3"),
    interaction.options.getAttachment("image4")
  ].filter(img => img !== null);

  if (!process.env.GEMINI_API_KEY) {
    return interaction.editReply("❌ مفتاح GEMINI_API_KEY غير موجود في الإعدادات!");
  }

  try {
    const imageParts = await Promise.all(images.map(async (img) => {
      const response = await fetch(img.url);
      const buffer = await response.arrayBuffer();
      return {
        inlineData: {
          data: Buffer.from(buffer).toString("base64"),
          mimeType: img.contentType || "image/png"
        }
      };
    }));

    const prompt = `
You are analyzing screenshots of the Throne and Liberty WEEKLY schedule (Daily Tab).
This tab shows the events for the entire week, day by day (Date and Day name, e.g., "19/07 Sun", "22/07 Wed").
Your job is to look at each Day block, identify if there is an Arc Boss icon, and record its hour.

CRITICAL RULES FOR CLASSIFICATION:
Arc Bosses are the massive server bosses. They appear as icons inside hexagons.
We want to extract the Arc Boss hours for EACH DAY of the week shown.
Day numbers for output: Sunday=0, Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6.

Your task is to return ONLY a pure JSON object.
Return an array called 'weekly_arc_bosses' containing objects for EACH day you found Arc Bosses on.
{
  "weekly_arc_bosses": [
    { "day": 3, "hours": [20, 23] },
    { "day": 6, "hours": [20, 23] }
  ]
}
If a boss appears at a half-hour like 20:30, ignore it, we only want the main hour marks.
If a day has NO Arc Bosses, you can omit it or pass empty hours array.
Make sure to combine findings from all provided images.
`;

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();
    
    let cleanedJson = responseText.trim();
    if (cleanedJson.startsWith("```json")) {
      cleanedJson = cleanedJson.replace(/```json/g, "").replace(/```/g, "").trim();
    } else if (cleanedJson.startsWith("```")) {
      cleanedJson = cleanedJson.replace(/```/g, "").trim();
    }

    const scheduleData = JSON.parse(cleanedJson);
    const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    
    let updatedDays = [];

    if (Array.isArray(scheduleData.weekly_arc_bosses)) {
      for (const dailyData of scheduleData.weekly_arc_bosses) {
        const d = dailyData.day;
        if (d >= 0 && d <= 6) {
          const existingSchedule = await getTlSchedule(d) || {};
          let fieldBossHours = existingSchedule.field_boss_hours || "";
          let eventHours = existingSchedule.event_hours || "";
          let whaleHours = existingSchedule.whale_hours || "";
          
          let aHours = Array.isArray(dailyData.hours) ? dailyData.hours : [];
          let arcBossHours = [...new Set(aHours)].join(",");

          await saveTlSchedule(d, fieldBossHours, arcBossHours, eventHours, whaleHours);
          
          if (arcBossHours.length > 0) {
              updatedDays.push(`- **${dayNames[d]}**: أوقات (${arcBossHours})`);
          }
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`✅ تم تحديث جدول زعماء الآرك الأسبوعي`)
      .setColor("#00ff00")
      .setDescription(`تم التعرف على الأيام من الصور المرفوعة واستخراج أوقات زعماء الآرك لكل يوم بدقة، وحفظها بنجاح مع الاحتفاظ بالجدول اليومي للزعماء العاديين.`)
      .addFields(
        { name: "👾 تفاصيل ما تم التعرف عليه من الصور (أيام الآرك)", value: updatedDays.length > 0 ? updatedDays.join("\n") : "لم يتم العثور على أي زعماء آرك في الصور!", inline: false }
      )
      .setFooter({ text: "تم تحليل الصور عبر الذكاء الاصطناعي (Gemini Vision)" });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error("[TL Arc Sync] Error:", error);
    await interaction.editReply(
      `❌ حدث خطأ أثناء تحليل الصور.\n**تفاصيل الخطأ:** ${error.message}`
    );
  }
}
