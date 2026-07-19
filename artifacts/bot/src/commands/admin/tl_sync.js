import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { saveTlSchedule, getTlSchedule } from "../../database/index.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const data = new SlashCommandBuilder()
  .setName("tl_sync")
  .setDescription("رفع صور جدول اللعبة ليتم تحليلها وتحديث التوقيتات عبر الذكاء الاصطناعي")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option =>
    option.setName("schedule_type")
      .setDescription("نوع الجدول المرفوع")
      .setRequired(true)
      .addChoices(
        { name: "جدول الساعات (الزعماء العاديين، أحداث، حوت)", value: "hourly" },
        { name: "جدول الأيام (زعماء الآرك الأسبوعي)", value: "daily" }
      )
  )
  .addAttachmentOption(option => option.setName("image1").setDescription("الصورة الأولى للجدول").setRequired(true))
  .addStringOption(option =>
    option.setName("day")
      .setDescription("اليوم الخاص بالجدول (مطلوب فقط في جدول الساعات)")
      .setRequired(false)
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
  .addAttachmentOption(option => option.setName("image2").setDescription("الصورة الثانية (اختياري)").setRequired(false))
  .addAttachmentOption(option => option.setName("image3").setDescription("الصورة الثالثة (اختياري)").setRequired(false))
  .addAttachmentOption(option => option.setName("image4").setDescription("الصورة الرابعة (اختياري)").setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const scheduleType = interaction.options.getString("schedule_type");
  const dayStr = interaction.options.getString("day");
  
  if (scheduleType === "hourly" && !dayStr) {
    return interaction.editReply("❌ يجب عليك اختيار (اليوم) عند رفع جدول الساعات (Hourly)!");
  }

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

    let prompt = "";

    if (scheduleType === "hourly") {
      prompt = `
You are analyzing screenshots of the Throne and Liberty DAILY event schedule.
I need you to extract the hours (0 to 23) for Bosses, Events, and Whales.
CRITICAL RULES FOR CLASSIFICATION:
1. Arc Boss (👾): These are the massive server bosses. You must classify a boss as Arc Boss ONLY if it visually matches one of these:
   - A purple tree-like monster with a cloud-like top and roots at the bottom.
   - A purple screaming skull/ghostly face.
   - A purple hooded/cloaked figure showing a hand or glove.
   - A purple winged queen/figure holding a long staff.
   - The giant sandworm (Excavator).
2. Field Boss (👹): These are the standard normal bosses. You must classify a boss as Field Boss if it is ANY OTHER boss not listed above (for example: red skeletal head, purple stone golem, etc).
3. Dynamic Events (⚔️): A row of multiple small icons (4-6 icons in a row).
4. Whale (Gigantrite 🐋): The Whale icon.
Note: IGNORE small modifier icons like a blue dove (peace), green shield (guild), or red crossed swords (conflict). Look ONLY at the main monster in the icon!

Your task is to return ONLY a pure JSON object with the following structure.
List EACH boss icon you see in the 'bosses' array with its hour and type ('field' or 'arc'):
{
  "bosses": [
    { "hour": 14, "type": "field" },
    { "hour": 23, "type": "arc" },
    { "hour": 23, "type": "field" }
  ],
  "event_hours": [list of integer hours (0-23) where Dynamic Events appear],
  "whale_hours": [list of integer hours (0-23) where Whale appears]
}
If an event appears at a half-hour like 00:30, ignore it, we only want the main hour marks (e.g., 0, 14, 22).
Make sure to combine findings from all provided images.
`;
    } else if (scheduleType === "daily") {
      prompt = `
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
    }

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();
    
    let cleanedJson = responseText.trim();
    if (cleanedJson.startsWith("\`\`\`json")) {
      cleanedJson = cleanedJson.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
    } else if (cleanedJson.startsWith("\`\`\`")) {
      cleanedJson = cleanedJson.replace(/\`\`\`/g, "").trim();
    }

    const scheduleData = JSON.parse(cleanedJson);
    const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

    if (scheduleType === "hourly") {
      const dayOfWeek = parseInt(dayStr, 10);
      const existingSchedule = await getTlSchedule(dayOfWeek) || {};
      
      let fHours = [];
      
      if (Array.isArray(scheduleData.bosses)) {
        scheduleData.bosses.forEach(b => {
          if (b.type === 'field') fHours.push(b.hour);
        });
      }

      let fieldBossHours = [...new Set(fHours)].join(",");
      let eventHours = Array.isArray(scheduleData.event_hours) ? scheduleData.event_hours.join(",") : "";
      let whaleHours = Array.isArray(scheduleData.whale_hours) ? scheduleData.whale_hours.join(",") : "";
      let arcBossHours = existingSchedule.arc_boss_hours || "";

      await saveTlSchedule(dayOfWeek, fieldBossHours, arcBossHours, eventHours, whaleHours);

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

    } else if (scheduleType === "daily") {
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
                updatedDays.push(`${dayNames[d]}: ${arcBossHours}`);
            }
          }
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`✅ تم تحديث جدول زعماء الآرك الأسبوعي`)
        .setColor("#00ff00")
        .setDescription("تم استخراج أوقات زعماء الآرك لجميع الأيام وحفظها بنجاح مع الاحتفاظ بالجدول اليومي لكل يوم.")
        .addFields(
          { name: "👾 أيام زعماء الآرك المكتشفة", value: updatedDays.length > 0 ? updatedDays.join("\n") : "لم يتم العثور على زعماء آرك", inline: false }
        )
        .setFooter({ text: "تم تحليل الصور عبر الذكاء الاصطناعي (Gemini Vision)" });

      await interaction.editReply({ embeds: [embed] });
    }

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
