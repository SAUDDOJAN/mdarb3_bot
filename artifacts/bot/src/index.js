import "dotenv/config";
import { EmbedBuilder, REST, Routes, SlashCommandBuilder } from "discord.js";
import http from "http";
import fs from "fs"; // حزمة النظام الأساسية لإدارة الملفات تلقائياً
import client from "./client.js";
import { initDb } from "./database/index.js";
import { getSyncedChannels } from "./database/radar.js";
import { initSocket, emitDiscordMessage } from "./socket.js";
import { handleDungeonsApi } from "./api.js";

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse path
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (parsedUrl.pathname === "/api/widget") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(globalThis.widgetData || { error: "لم يتم تجهيز البيانات بعد أو البوت قيد التشغيل" }));
    return;
  }

  // Handle new Dungeon APIs
  handleDungeonsApi(req, res, parsedUrl).then(handled => {
    if (!handled) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", bot: client.isReady() ? "online" : "starting" }));
    }
  }).catch(err => {
    console.error("[API] Uncaught API Error:", err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });
});

initSocket(server);
server.listen(PORT, "0.0.0.0", () => console.log(`[Bot] Health & Socket server listening on 0.0.0.0:${PORT}`));

// تفعيل صلاحيات قراءة محتوى الرسائل إجبارياً لحل مشكلة الحجب
client.options.intents?.add?.(["Guilds", "GuildMessages", "MessageContent"]);

const DATA_FILE = "./m3rgeen_radar.json";

const SAGE_HUB_CHANNEL_ID = "1507706953521041509";

// المزامنة المتعددة الأوتوماتيكية عبر ملف JSON الموحد
client.on("messageCreate", (message) => {
  if (message.author.bot || message.webhookId || message.applicationId === client.user.id) return;

  // Real-time Chat Sync with App for General Channel
  if (message.channel.id === "1294312574162178200") {
    emitDiscordMessage(message);
  }

  const syncedData = getSyncedChannels();
  const syncedChannelIds = Object.values(syncedData);
  
  // Ensure the Sage Hub Channel is always part of the synced network
  if (!syncedChannelIds.includes(SAGE_HUB_CHANNEL_ID)) {
    syncedChannelIds.push(SAGE_HUB_CHANNEL_ID);
  }

  if (!syncedChannelIds.includes(message.channel.id)) return;

  const embed = new EmbedBuilder()
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setDescription(message.content || "*رسالة بدون نص*")
    .setColor("#ffaa00")
    .setFooter({ text: `تحالف M3RGEEN | سيرفر: ${message.guild?.name || "غير معروف"}` })
    .setTimestamp();

  const files = message.attachments.map(attachment => attachment.url);

  for (const channelId of syncedChannelIds) {
    if (channelId === message.channel.id) continue;

    client.channels.fetch(channelId).then(targetChannel => {
      if (targetChannel) {
        targetChannel.send({ embeds: [embed], files: files });
      }
    }).catch(error => {
      console.error(`[Bot] خطأ في إرسال الرسالة للروم ${channelId}:`, error.message);
    });
  }
});

// ─── NOTE: معالجة الأوامر والأزرار الآن عبر نظام الـ events الكامل ────────────
// تمت إزالة الـ interactionCreate handler القديم من هنا لأنه كان يتعارض مع
// نظام interactionCreate.js الذي يعالج جميع أنواع الـ interactions بشكل صحيح.
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[Database] نظام ملفات الرادار المستقر جاهز العمل.");
  console.log("[Bot] Starting M3RGEEN bot...");

  // ─── تحميل نظام الأوامر والأحداث الكامل ───────────────────────────────────
  // هذا يحمّل interactionCreate.js الذي يعالج slash commands + buttons + modals
  const { loadCommands } = await import("./handlers/commandHandler.js");
  const { loadEvents } = await import("./handlers/eventHandler.js");

  await loadCommands(client);
  await loadEvents(client);
  // ──────────────────────────────────────────────────────────────────────────

  await initDb();

  const { startWidgetSync } = await import("./tasks/widgetSync.js");
  startWidgetSync(client);

  const { startSocialNotifier } = await import("./tasks/socialNotifier.js");
  startSocialNotifier(client);

  await client.login(process.env.DISCORD_BOT_TOKEN);
}

main().catch((err) => {
  console.error("[Bot] Fatal startup error:", err);
  process.exit(1);
});