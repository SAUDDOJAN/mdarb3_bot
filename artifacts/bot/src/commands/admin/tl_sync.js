import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { saveTlSchedule } from "../../database/index.js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const data = new SlashCommandBuilder()
  .setName("tl_sync")
  .setDescription("رفع صور جدول اللعبة ليتم تحليلها وتحديث التوقيتات عبر الذكاء الاصطناعي")
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

async function urlToGenerativePart(url, mimeType) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return {
    inlineData: {
      data: Buffer.from(buffer).toString("base64"),
      mimeType
    },
  };
}

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const dayOfWeek = parseInt(interaction.options.getString("day"), 10);
  const images = [
    interaction.options.getAttachment("image1"),
    interaction.options.getAttachment("image2"),
    interaction.options.getAttachment("image3"),
    interaction.options.getAttachment("image4")
  ].filter(img => img !== null);

  if (!process.env.OPENAI_API_KEY) {
    return interaction.editReply("❌ مفتاح `OPENAI_API_KEY` غير موجود في الإعدادات!");
  }

  try {
    const imageUrls = images.map(img => img.url);

    const prompt = `
You are analyzing screenshots of the Throne and Liberty event schedule.
I need you to extract the hours (0 to 23) for three categories: Bosses, Events, and Whales.
CRITICAL RULES FOR CLASSIFICATION:
1. Field Boss: Any icon inside a diamond shape (red or purple).
2. Arc Boss: Large purple monster shapes (e.g. big purple golem, sand worm, tree).
3. Dynamic Events: A row of multiple small icons (4-6 icons in a row).
4. Whale (Gigantrite): The Whale icon.
Note: IGNORE small modifier icons like a blue dove (peace), green shield (guild), or red crossed swords (conflict). Look at the core boss shape!

Your task is to return ONLY a pure JSON object with the following structure (no markdown tags, no explanations, just the JSON):
{
  "boss_hours": [list of integer hours (0-23) where either Field Boss or Arc Boss appears],
  "event_hours": [list of integer hours (0-23) where Dynamic Events appear],
  "whale_hours": [list of integer hours (0-23) where Whale appears]
}
If an event appears at a half-hour like 00:30, ignore it, we only want the main hour marks (e.g., 0, 14, 22).
Make sure to combine findings from all provided images.
    `;

    const contentArray = [{ type: "text", text: prompt }];
    for (const url of imageUrls) {
      contentArray.push({ type: "image_url", image_url: { url } });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: contentArray }],
      max_tokens: 1000
    });

    const responseText = completion.choices[0].message.content;
    
    // Clean up the text if it contains markdown JSON blocks
    let cleanedJson = responseText.trim();
    if (cleanedJson.startsWith("\`\`\`json")) {
      cleanedJson = cleanedJson.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
    } else if (cleanedJson.startsWith("\`\`\`")) {
      cleanedJson = cleanedJson.replace(/\`\`\`/g, "").trim();
    }

    const scheduleData = JSON.parse(cleanedJson);

    const bossHours = scheduleData.boss_hours.join(",");
    const eventHours = scheduleData.event_hours.join(",");
    const whaleHours = scheduleData.whale_hours.join(",");

    await saveTlSchedule(dayOfWeek, bossHours, eventHours, whaleHours);

    const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    
    const embed = new EmbedBuilder()
      .setTitle(`✅ تم مزامنة جدول يوم ${dayNames[dayOfWeek]}`)
      .setColor("Green")
      .addFields(
        { name: "👹 أوقات الزعماء (Bosses)", value: bossHours.length > 0 ? bossHours : "لا يوجد", inline: false },
        { name: "⚔️ أوقات الفعاليات (Events)", value: eventHours.length > 0 ? eventHours : "لا يوجد", inline: false },
        { name: "🐋 أوقات الحوت (Whales)", value: whaleHours.length > 0 ? whaleHours : "لا يوجد", inline: false }
      )
      .setFooter({ text: "تم تحليل الصور عبر الذكاء الاصطناعي (Gemini Vision)" });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error("[TL Sync] Error:", error);
    await interaction.editReply(`❌ حدث خطأ أثناء تحليل الصور: ${error.message}`);
  }
}
