import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { saveTlSchedule, getTlSchedule } from "../../database/index.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const data = new SlashCommandBuilder()
  .setName("tl_sync")
  .setDescription("رفع صور جدول اللعبة للزعماء العاديين والأحداث ليتم تحليلها عبر الذكاء الاصطناعي")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option =>
    option.setName("day")
      .setDescription("اليوم الخاص بالجدول")
      .setRequired(true)
      .addChoices(
        { name: "الأحد (Sunday)", value: "0" },
        { name: "الإثنين (Monday)", value: "1" },
        { name: "الثلاثاء (Tuesday)", value: "2" },
        { name: "الأربعاء (Wednesday)", value: "3" },
        { name: "الخميس (Thursday)", value: "4" },
        { name: "الجمعة (Friday)", value: "5" },
        { name: "السبت (Saturday)", value: "6" }
      )
  )
  .addAttachmentOption(option => option.setName("image1").setDescription("الصورة الأولى للجدول").setRequired(true))
  .addAttachmentOption(option => option.setName("image2").setDescription("الصورة الثانية (اختياري)").setRequired(false))
  .addAttachmentOption(option => option.setName("image3").setDescription("الصورة الثالثة (اختياري)").setRequired(false))
  .addAttachmentOption(option => option.setName("image4").setDescription("الصورة الرابعة (اختياري)").setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const dayOfWeek = parseInt(interaction.options.getString("day"), 10);
  
  const images = [
    interaction.options.getAttachment("image1"),
    interaction.options.getAttachment("image2"),
    interaction.options.getAttachment("image3"),
    interaction.options.getAttachment("image4")
  ].filter(img => img !== null);

  if (!process.env.GEMINI_API_KEY) {
    return interaction.editReply("❌ مفتاح `GEMINI_API_KEY` غير موجود في الإعدادات!");
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
You are analyzing screenshots of the Throne and Liberty DAILY event schedule.
I need you to extract the hours (0 to 23) for Bosses, Events, and Whales.
CRITICAL RULES FOR CLASSIFICATION:
1. Field Boss (👹): These are the standard normal bosses. You must classify a boss as Field Boss if it is ANY boss (for example: red skeletal head, purple stone golem, etc). Please note, DO NOT extract Arc Bosses (massive server bosses like Queen, Sandworm, Kowazan) if they appear. Only extract normal Field Bosses.
2. Dynamic Events (⚔️): A row of multiple small icons (4-6 icons in a row).
3. Whale (Gigantrite 🐋): The Whale icon.
Note: IGNORE small modifier icons like a blue dove (peace), green shield (guild), or red crossed swords (conflict). Look ONLY at the main monster in the icon!

Your task is to return ONLY a pure JSON object with the following structure.
List EACH boss icon you see in the 'bosses' array with its hour:
{
  "bosses": [
    { "hour": 14 },
    { "hour": 23 }
  ],
  "event_hours": [list of integer hours (0-23) where Dynamic Events appear],
  "whale_hours": [list of integer hours (0-23) where Whale appears]
}
If an event appears at a half-hour like 00:30, ignore it, we only want the main hour marks (e.g., 0, 14, 22).
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
    const existingSchedule = await getTlSchedule(dayOfWeek) || {};
    
    let fHours = [];
    
    if (Array.isArray(scheduleData.bosses)) {
      scheduleData.bosses.forEach(b => fHours.push(b.hour));
    }

    let fieldBossHours = [...new Set(fHours)].join(",");
    let eventHours = Array.isArray(scheduleData.event_hours) ? scheduleData.event_hours.join(",") : "";
    let whaleHours = Array.isArray(scheduleData.whale_hours) ? scheduleData.whale_hours.join(",") : "";
    let arcBossHours = existingSchedule.arc_boss_hours || ""; // PRESERVE ARC BOSS

    await saveTlSchedule(dayOfWeek, fieldBossHours, arcBossHours, eventHours, whaleHours);

    const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

    const embed = new EmbedBuilder()
      .setTitle(`✅ تم تحديث جدول الساعات ليوم ${dayNames[dayOfWeek]}`)
      .setColor("#00ff00")
      .setDescription("تم تحديث أوقات (الزعماء العاديين، الفعاليات، الحوت) بنجاح مع الاحتفاظ بأوقات زعماء الآرك السابقة.")
      .addFields(
        { name: "👹 أوقات الزعماء (Field Boss)", value: fieldBossHours || "لا يوجد", inline: false },
        { name: "⚔️ أوقات الفعاليات (Events)", value: eventHours || "لا يوجد", inline: false },
        { name: "🐋 أوقات الحوت (Whales)", value: whaleHours || "لا يوجد", inline: false }
      )
      .setFooter({ text: "تم تحليل الصور عبر الذكاء الاصطناعي (Gemini Vision)" });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error("[TL Sync] Error:", error);
    const keyPrefix = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + "..." : "No Key";
    await interaction.editReply(
      `❌ حدث خطأ أثناء تحليل الصور.\n` +
      `**تفاصيل الخطأ:** ${error.message}\n` +
      `**المفتاح المستخدم حالياً في السيرفر يبدأ بـ:** \`${keyPrefix}\`\n\n` +
      `إذا كان هذا المفتاح هو المفتاح القديم، فهذا يعني أن السيرفر لم يتحدث بعد. الرجاء إعادة تشغيل البوت يدوياً من Railway.`
    );
  }
}
