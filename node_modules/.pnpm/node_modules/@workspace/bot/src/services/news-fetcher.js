import axios from "axios";
import * as cheerio from "cheerio";
import { EmbedBuilder } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { query } from "../database/index.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyB01XsrWwXTOoBznwK4Xp4TajzTTUH3kdI");
const geminiModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

const SHUGO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://shugo.gg/",
};

const AION_DICTIONARY = {
  "abyss": "الهاوية (Abyss)",
  "dungeon": "دنجن (Dungeon)",
  "buff": "تعزيز (Buff)",
  "nerf": "إضعاف (Nerf)",
  "stigma": "ستيجما (Stigma)",
  "kinah": "كينا (Kinah)",
  "boss": "زعيم (Boss)",
  "patch": "تحديث (Patch)",
  "skill": "مهارة (Skill)",
  "class": "تخصص (Class)",
  "pvp": "لاعب ضد لاعب (PvP)",
  "pve": "لاعب ضد بيئة (PvE)"
};

function applyDictionaryLocal(text) {
  let processed = text;
  for (const [en, ar] of Object.entries(AION_DICTIONARY)) {
    const regex = new RegExp(`\\b${en}\\b`, "gi");
    processed = processed.replace(regex, ar);
  }
  return processed;
}

function chunkTextLocal(text, maxLen = 900) {
  const chunks = [];
  let current = "";
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if ((current + "\n" + trimmed).length > maxLen) {
      if (current) chunks.push(current.trim());
      current = trimmed;
    } else {
      current += (current ? "\n" : "") + trimmed;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

/**
 * Strips HTML and uses Gemini to summarize and formulate the content in one go.
 */
async function processNewsContent(title, rawHtml) {
  const $ = cheerio.load(rawHtml);
  // Remove unwanted tags
  $("script, style, nav, footer").remove();
  
  // Format block elements with line breaks before extracting text
  $("br").replaceWith("\n");
  $("p, h1, h2, h3, h4, h5, h6").each((_, el) => $(el).append("\n\n"));
  $("li").prepend("• ").append("\n");

  let textContent = $.text()
    .replace(/[ \t]+/g, " ")       
    .replace(/\n{3,}/g, "\n\n")    
    .trim();

  // Limit input to a very safe bound (Gemini can handle much more, but we keep it reasonable)
  if (textContent.length > 20000) {
    textContent = textContent.slice(0, 20000) + "...";
  }

  const prompt = `أنت محرر أخبار ألعاب محترف. مهمتك تحويل هذا النص الإنجليزي إلى تقرير عربي احترافي. استخدم المصطلحات العربية المعتمدة في مجتمع Aion (مثل: الزنزانة، الهاوية، ستيجما، تعزيز). يمنع منعاً باتاً كتابة الجمل الإنجليزية بجانب العربية. يمنع منعاً باتاً إظهار أي تحذيرات أو جمل مثل (صياغة آلية). استخدم العناوين العريضة (Bold) والنقاط (Bullets). إذا كان النص طويلاً، قم بتلخيصه بذكاء (Summarize) وركز على المعلومات المهمة فقط، لا تترجم النص حرفياً لتجنب مشكلة الطول.

يجب أن تقوم بإرجاع النتيجة بصيغة JSON حصراً، وتحتوي على المفاتيح التالية:
1. "title": عنوان الخبر باللغة العربية بأسلوب احترافي وجذاب.
2. "summary": ملخص مكثف جداً للخبر.
3. "fields": مصفوفة (Array) تحتوي على أقسام الخبر (مثل: التحديثات، التعديلات التقنية، إلخ)، كل قسم يمتلك:
   - "name": عنوان القسم بخط عريض مع إيموجي (مثال: "**⚔️ الميزات الجديدة**").
   - "value": تفاصيل القسم كنقاط متسلسلة (Bullet points) قصيرة، بحد أقصى 900 حرف للقسم الواحد (لخص الباقي بذكاء).

عنوان الخبر: ${title}

النص:
${textContent}`;

  console.log(`[NewsFetcher] Sending full article to Gemini for smart formulation...`);

  try {
    const result = await geminiModel.generateContent(prompt);
    let responseText = result.response.text().trim();
    
    // Clean up markdown wrapping if present
    responseText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    const parsed = JSON.parse(responseText);

    return {
      title: parsed.title || title,
      summary: parsed.summary || "تحديث جديد",
      fields: Array.isArray(parsed.fields) ? parsed.fields : []
    };
  } catch (e) {
    console.error(`[NewsFetcher] Gemini API failed:`, e.message);
    console.log("[NewsFetcher] Falling back to Local Smart Editor to ensure post success...");
    
    // Fallback: Local Dictionary Replacement
    const localTitle = applyDictionaryLocal(title);
    const localText = applyDictionaryLocal(textContent);
    const chunks = chunkTextLocal(localText, 900);

    return {
      title: localTitle,
      summary: chunks[0] || "تحديث جديد",
      fields: chunks.slice(1, 10).map((c, i) => ({
        name: `**🔹 تفاصيل إضافية (${i + 1})**`,
        value: c.slice(0, 1024)
      }))
    };
  }
}

/**
 * Main function to fetch, translate, and post news.
 */
export async function fetchAndPostNews(client) {
  const channelId = process.env.NEWS_CHANNEL_ID;
  if (!channelId) {
    console.warn("[NewsFetcher] NEWS_CHANNEL_ID is not set in .env. Skipping news fetch.");
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    console.warn("[NewsFetcher] GEMINI_API_KEY is not set in .env. Skipping news fetch.");
    return;
  }

  console.log(`[NewsFetcher] Initialized. Channel ID: ${channelId}, Gemini Key Length: ${process.env.GEMINI_API_KEY.length}`);

  let channel = client.channels.cache.get(channelId);
  if (!channel) {
    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      console.error(`[NewsFetcher] ERROR: Could not find or fetch channel with ID ${channelId}! Err: ${err.message}`);
      return;
    }
  }

  console.log("[NewsFetcher] Checking for new articles on Shugo.gg...");

  try {
    // 1. Fetch news list
    console.log("[NewsFetcher] Requesting https://shugo.gg/api/news ...");
    const listRes = await axios.get("https://shugo.gg/api/news", { headers: SHUGO_HEADERS });
    const newsList = listRes.data?.news || listRes.data?.list || listRes.data;

    console.log(`[NewsFetcher] Received ${Array.isArray(newsList) ? newsList.length : 'invalid'} items from API. Raw type: ${typeof newsList}`);

    if (!Array.isArray(newsList) || newsList.length === 0) {
      console.log("[NewsFetcher] No news found in the API response.");
      return;
    }

    console.log("[NewsFetcher] Archiving older news to prevent quota usage...");
    // Mark all items from index 1 to the end as read (do not process)
    for (let i = 1; i < newsList.length; i++) {
      if (newsList[i]?.slug) {
        await query("INSERT INTO posted_news (slug) VALUES ($1) ON CONFLICT (slug) DO NOTHING", [newsList[i].slug]);
      }
    }

    // Now process ONLY the latest news (index 0)
    const news = newsList[0];
    if (!news || !news.slug) return;

    // 2. Check if latest is already posted
    const dbCheck = await query("SELECT id FROM posted_news WHERE slug = $1", [news.slug]);
    if (dbCheck.rows.length > 0) {
      console.log("[NewsFetcher] The latest article is already posted. Nothing to do.");
      return; // Already posted
    }

    console.log(`[NewsFetcher] New latest article found: ${news.slug}`);

    console.log(`[NewsFetcher] Fetching content for: ${news.slug}`);
    const detailRes = await axios.get(`https://shugo.gg/api/news/${news.slug}`, { headers: SHUGO_HEADERS });
    const detailData = detailRes.data?.news || detailRes.data?.article || detailRes.data;
    const rawHtml = detailData?.content || news.excerpt || "No content provided.";
    
    console.log(`[NewsFetcher] Translating content for: ${news.slug} (length: ${rawHtml.length} chars)`);
    // 4. Translate and Format via OpenAI
    const newsData = await processNewsContent(news.title, rawHtml);

    if (!newsData) {
      console.error(`[NewsFetcher] Failed to process content for ${news.slug} via OpenAI/Google. Skipping...`);
      return;
    }
    console.log(`[NewsFetcher] Translation successful for: ${news.slug}. Preparing to send to Discord...`);

    // 5. Construct Discord Embed (Single Embed)
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📰 ${newsData.title || news.title || "تحديث جديد"}`)
      .setURL(`https://shugo.gg/news/${news.slug}`)
      .setDescription(newsData.summary || "لا يوجد ملخص.")
      .setFooter({ text: "AION 2 News • Powered by Shugo.gg & AI" })
      .setTimestamp(new Date(news.date || Date.now()));

    // Add fields safely (limit to 25 just in case)
    if (newsData.fields && newsData.fields.length > 0) {
      let fieldCount = 0;
      for (const field of newsData.fields) {
        if (fieldCount >= 25) break; // Discord maximum limit
        if (field.name && field.value) {
          const safeName = String(field.name).slice(0, 256).trim() || "تابع";
          const safeValue = String(field.value).slice(0, 1024).trim() || "...";
          embed.addFields({ name: safeName, value: safeValue });
          fieldCount++;
        }
      }
    }

    // 6. Post to Discord
    await channel.send({ embeds: [embed] });

    // 7. Mark as posted in DB
    await query("INSERT INTO posted_news (slug) VALUES ($1) ON CONFLICT (slug) DO NOTHING", [news.slug]);
    console.log(`[NewsFetcher] Successfully posted news: ${news.slug}`);
    
  } catch (error) {
    console.error("[NewsFetcher] Error fetching news:", error.message);
  }
}
