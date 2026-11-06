import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "../../aion2_siege_attendees.json");

export const TARGET_CHANNEL_ID = "1567572191959064589";
export const M3RGEEN_ROLE_ID = "1555617080521269368";
export const VOICE_CHANNEL_ID = "1558947326704226424";
export const SIEGE_BANNER_URL = "https://raw.githubusercontent.com/SAUDDOJAN/mdarb3_bot/main/artifacts/bot/assets/aion2_siege_banner.jpg";

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[aion2SiegeAlert] Failed to read attendees file:", err.message);
  }
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[aion2SiegeAlert] Failed to write attendees file:", err.message);
  }
}

export function getAttendees(messageId) {
  const data = loadData();
  return Array.isArray(data[messageId]) ? data[messageId] : [];
}

export function buildSiegeComponents(attendeeCount = 0) {
  const attendBtn = new ButtonBuilder()
    .setCustomId("aion2_siege_attend")
    .setLabel(`تأكيد الحضور (${attendeeCount})`)
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);

  const listBtn = new ButtonBuilder()
    .setCustomId("aion2_siege_list")
    .setLabel("قائمة الحضور 📋")
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(attendBtn, listBtn);
}

/**
 * Fetch timer schedule directly from Shugo.gg API
 */
export async function fetchShugoTimers() {
  const res = await fetch("https://shugo.gg/timers.json", {
    headers: { "Accept": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Shugo timers request failed: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Extract next / today's Europe Artifact Siege schedule from Shugo
 */
export async function getEuropeSiegeSchedule(forceNext = false) {
  let euSchedule = {
    type: "weekly",
    days: ["thu", "sat"],
    times: ["21:00", "21:05", "21:10"]
  };

  try {
    const data = await fetchShugoTimers();
    const siegeEvent = data.events?.find(e => e.id === "artifact-siege");
    if (siegeEvent?.schedules?.["global-eu"]) {
      euSchedule = siegeEvent.schedules["global-eu"];
    }
  } catch (err) {
    console.warn("[aion2SiegeAlert] Warning: Failed to fetch live Shugo timers, falling back to cached schedule:", err.message);
  }

  const siegeDays = (euSchedule.days || ["thu", "sat"]).map(d => d.toLowerCase());
  const siegeTimeStr = euSchedule.times?.[0] || "21:00";
  const [sHour, sMin] = siegeTimeStr.split(":").map(Number);

  const now = new Date();
  const berlinStr = now.toLocaleString("en-US", { timeZone: "Europe/Berlin" });
  const berlinDate = new Date(berlinStr);
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const currentDayName = dayNames[berlinDate.getDay()];

  const isTodaySiege = siegeDays.includes(currentDayName);

  let daysToAdd = 0;
  if (!isTodaySiege || forceNext) {
    for (let i = 1; i <= 7; i++) {
      const nextDate = new Date(berlinDate);
      nextDate.setDate(nextDate.getDate() + i);
      const nextDay = dayNames[nextDate.getDay()];
      if (siegeDays.includes(nextDay)) {
        daysToAdd = i;
        break;
      }
    }
  }

  const targetDate = new Date(berlinDate);
  targetDate.setDate(targetDate.getDate() + daysToAdd);
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getDate()).padStart(2, "0");

  // Calculate Berlin timezone offset relative to UTC for target day
  const approxDate = new Date(`${year}-${month}-${day}T${String(sHour).padStart(2, "0")}:${String(sMin).padStart(2, "0")}:00Z`);
  const utcDate = new Date(approxDate.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(approxDate.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const offsetMin = (tzDate - utcDate) / (60 * 1000);

  const siegeUtcMs = approxDate.getTime() - (offsetMin * 60 * 1000);
  const siegeUnix = Math.floor(siegeUtcMs / 1000);
  // Gathering time is 30 minutes before siege start
  const gatheringUnix = siegeUnix - (30 * 60);

  return {
    isTodaySiege,
    daysToAdd,
    siegeUnix,
    gatheringUnix,
    schedule: euSchedule
  };
}

/**
 * Build announcement embed preserving the original exact layout, banner, and styling
 */
export function buildSiegeAnnouncementEmbed({
  siegeUnix,
  gatheringUnix,
  attendeeCount = 0,
  notes = null
}) {
  const desc = [
    "**تعلن قيادة تحالف معرقين عن انطلاق عمليات الحصار.**",
    "على جميع المقاتلين الالتزام التام بالتوقيتات المحددة والتواجد في الروم الصوتي.",
    "",
    `📅 **اليوم:** <t:${siegeUnix}:D>`,
    `🌀 **توقيت التجمع:** <t:${gatheringUnix}:t> (<t:${gatheringUnix}:R>)`,
    `⚔️ **توقيت انطلاق الحصار:** <t:${siegeUnix}:t> (<t:${siegeUnix}:R>)`,
    "📍 **مكان التجمع:** `قاعدة الأبيس جانب الكورة المتوهجة`",
    `🔊 **روم التجمع الصوتي:** <#${VOICE_CHANNEL_ID}> ([اضغط هنا للدخول المباشر](https://discord.com/channels/861355983975874601/${VOICE_CHANNEL_ID}))`,
    "",
    ...(notes ? [`📝 **توجيهات القيادة والتكتيك:**\n${notes}`, ""] : []),
    "🛡️ **التعليمات والإرشادات:**",
    "• التواجد ضروري في الروم الصوتي قبل موعد التجمع بساعة كاملة.",
    "• تجهيز كافة الجرع والأطعمة وبوفات الحرب والعتاد مسبقاً.",
    "• التواجد في قاعدة الأبيس جانب الكورة المتوهجة وقت التجمع دون تأخير.",
    "",
    `👥 **عدد الحضور المؤكدين:** \`${attendeeCount} لاعب\``
  ].join("\n");

  return new EmbedBuilder()
    .setColor(0x992D22) // Royal Dark Crimson
    .setTitle("⚔️ إعلان حصار AION 2 | نداء الحرب لكتيبة M3RGEEN ⚔️")
    .setDescription(desc)
    .setImage(SIEGE_BANNER_URL)
    .setFooter({ text: "تحالف M3RGEEN • جيش المعرقين • اضغط علامة الصح لتأكيد حضورك" })
    .setTimestamp();
}

/**
 * Register active siege announcement for automated reminders (2 hours & 5 minutes before)
 */
export function registerActiveSiege({ messageId, channelId, siegeUnix, gatheringUnix }) {
  const data = loadData();
  data._active_sieges = Array.isArray(data._active_sieges) ? data._active_sieges : [];

  // Remove any previous entry with same messageId
  data._active_sieges = data._active_sieges.filter(s => s.messageId !== messageId);

  data._active_sieges.push({
    messageId,
    channelId,
    siegeUnix,
    gatheringUnix,
    reminded2h: false,
    reminded5m: false,
    createdAt: new Date().toISOString()
  });

  saveData(data);
  console.log(`[aion2SiegeAlert] Registered active siege for reminders: Message ${messageId}, Siege Unix: ${siegeUnix}`);
}

/**
 * Send 2-Hour reminder mentioning participants and emphasizing gathering necessity
 */
async function send2HourReminder(client, siege) {
  const channel = client.channels.cache.get(siege.channelId) ?? await client.channels.fetch(siege.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const attendees = getAttendees(siege.messageId);
  const mentionsText = attendees.length > 0 
    ? attendees.map(id => `<@${id}>`).join(" ") 
    : `<@&${M3RGEEN_ROLE_ID}>`;

  const embed = new EmbedBuilder()
    .setColor(0xE67E22) // Warning Orange
    .setTitle("⏳ تذكير بحرب الحصار (AION 2 Siege) | متبقي ساعتان!")
    .setDescription([
      "**نداء إلى جميع الأبطال المشاركين في الحصار اليوم:**",
      `⏰ **موعد انطلاق الحصار:** <t:${siege.siegeUnix}:t> (<t:${siege.siegeUnix}:R>)`,
      `🌀 **موعد التجمع:** <t:${siege.gatheringUnix}:t> (<t:${siege.gatheringUnix}:R>)`,
      `📍 **مكان التجمع:** \`قاعدة الأبيس جانب الكورة المتوهجة\``,
      `🔊 **الروم الصوتي:** <#${VOICE_CHANNEL_ID}> ([اضغط هنا للدخول المباشر](https://discord.com/channels/861355983975874601/${VOICE_CHANNEL_ID}))`,
      "",
      "🛡️ **تذكير بالتعليمات الهامة:**",
      "• **التواجد ضروري في الروم الصوتي قبل موعد التجمع بساعة كاملة.**",
      "• تجهيز كافة الجرع والأطعمة وبوفات الحرب والعتاد مسبقاً والجاهزية التامة.",
      "• التواجد في قاعدة الأبيس جانب الكورة المتوهجة وقت التجمع دون أي تأخير.",
      "",
      `👥 **المشاركون المسجلون حتى الآن (${attendees.length}):**`,
      mentionsText
    ].join("\n"))
    .setFooter({ text: "تحالف M3RGEEN • استعدوا للحرب" })
    .setTimestamp();

  const originalMsg = await channel.messages.fetch(siege.messageId).catch(() => null);
  const payload = {
    content: `📢 **تنبيه للمشاركين في السيج (متبقي ساعتان):**\n${mentionsText}`,
    embeds: [embed],
    allowedMentions: { parse: ["users", "roles"] }
  };

  if (originalMsg) {
    await originalMsg.reply(payload).catch(async () => {
      await channel.send(payload).catch(() => {});
    });
  } else {
    await channel.send(payload).catch(() => {});
  }

  console.log(`[aion2SiegeAlert] Successfully sent 2h siege reminder for message ${siege.messageId}`);
}

/**
 * Send 5-Minute urgent reminder mentioning participants to stay gathered around MDARB3
 */
async function send5MinuteReminder(client, siege) {
  const channel = client.channels.cache.get(siege.channelId) ?? await client.channels.fetch(siege.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const attendees = getAttendees(siege.messageId);
  const mentionsText = attendees.length > 0 
    ? attendees.map(id => `<@${id}>`).join(" ") 
    : `<@&${M3RGEEN_ROLE_ID}>`;

  const embed = new EmbedBuilder()
    .setColor(0xE74C3C) // Danger Red
    .setTitle("⚔️ نداء الحرب العاجل | بقيت 5 دقائق فقط على انطلاق السيج! 🔥")
    .setDescription([
      "🚨 **السيج حيبدأ بعد 5 دقائق! خلوكم متجمعين حول مدربع وجاهزين للانطلاق فوراً!**",
      "",
      `📍 **مكان التجمع:** \`قاعدة الأبيس جانب الكورة المتوهجة\``,
      `🔊 **الروم الصوتي:** <#${VOICE_CHANNEL_ID}> ([انتقال فوري للروم الصوتي](https://discord.com/channels/861355983975874601/${VOICE_CHANNEL_ID}))`,
      `⏰ **موعد البدء:** <t:${siege.siegeUnix}:t> (<t:${siege.siegeUnix}:R>)`,
      "",
      "⚔️ **إلى المعركة يا أبطال معرقين! النصر لحلفنا!**",
      "",
      `👥 **المحاربون المشاركون (${attendees.length}):**`,
      mentionsText
    ].join("\n"))
    .setFooter({ text: "تحالف M3RGEEN • جيش المعرقين" })
    .setTimestamp();

  const originalMsg = await channel.messages.fetch(siege.messageId).catch(() => null);
  const payload = {
    content: `⚔️ **تنبيه عاجل للمشاركين (5 دقائق على بدء السيج):**\n${mentionsText}`,
    embeds: [embed],
    allowedMentions: { parse: ["users", "roles"] }
  };

  if (originalMsg) {
    await originalMsg.reply(payload).catch(async () => {
      await channel.send(payload).catch(() => {});
    });
  } else {
    await channel.send(payload).catch(() => {});
  }

  console.log(`[aion2SiegeAlert] Successfully sent 5m siege reminder for message ${siege.messageId}`);
}

/**
 * Check and process automated 2h and 5m reminders
 */
export async function checkSiegeReminders(client) {
  const data = loadData();
  if (!Array.isArray(data._active_sieges) || data._active_sieges.length === 0) return;

  const nowUnix = Math.floor(Date.now() / 1000);
  let updated = false;

  for (const siege of data._active_sieges) {
    const timeUntilSiege = siege.siegeUnix - nowUnix;

    // 1. T-2 Hours Reminder (<= 7200 seconds / 2h, and > 300 seconds)
    if (!siege.reminded2h && timeUntilSiege <= 2 * 3600 && timeUntilSiege > 5 * 60) {
      await send2HourReminder(client, siege).catch(err => {
        console.error("[aion2SiegeAlert] Error sending 2h reminder:", err);
      });
      siege.reminded2h = true;
      updated = true;
    }

    // 2. T-5 Minutes Reminder (<= 300 seconds / 5m, and > -1800 seconds)
    if (!siege.reminded5m && timeUntilSiege <= 5 * 60 && timeUntilSiege > -1800) {
      await send5MinuteReminder(client, siege).catch(err => {
        console.error("[aion2SiegeAlert] Error sending 5m reminder:", err);
      });
      siege.reminded5m = true;
      updated = true;
    }
  }

  // Clean up completed sieges older than 2 hours after siege start
  const initialCount = data._active_sieges.length;
  data._active_sieges = data._active_sieges.filter(s => (s.siegeUnix - nowUnix) > -7200);
  if (data._active_sieges.length !== initialCount) {
    updated = true;
  }

  if (updated) {
    saveData(data);
  }
}

/**
 * Publish the siege announcement into Discord
 */
export async function publishSiegeAnnouncement(client, { channelId = TARGET_CHANNEL_ID, notes = null, forceSend = false } = {}) {
  const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Target channel ${channelId} not found or not text-based.`);
  }

  const siegeInfo = await getEuropeSiegeSchedule(false);
  if (!siegeInfo.isTodaySiege && !forceSend) {
    console.log("[aion2SiegeAlert] Today is not a siege day in Europe. Skipping announcement.");
    return null;
  }

  const embed = buildSiegeAnnouncementEmbed({
    siegeUnix: siegeInfo.siegeUnix,
    gatheringUnix: siegeInfo.gatheringUnix,
    attendeeCount: 0,
    notes
  });

  const row = buildSiegeComponents(0);

  const sendPayload = {
    content: `<@&${M3RGEEN_ROLE_ID}>`,
    allowedMentions: { roles: [M3RGEEN_ROLE_ID] },
    embeds: [embed],
    components: [row]
  };

  const sentMessage = await channel.send(sendPayload);
  await sentMessage.react("✅").catch(err => console.warn("[aion2SiegeAlert] Failed to react ✅:", err.message));

  // Automatically register for 2-hour and 5-minute automated participant reminders
  registerActiveSiege({
    messageId: sentMessage.id,
    channelId: channel.id,
    siegeUnix: siegeInfo.siegeUnix,
    gatheringUnix: siegeInfo.gatheringUnix
  });

  return sentMessage;
}

/**
 * Daily Cron running (Checks every 30 seconds for exact trigger timing and reminders)
 */
export function startDailySiegeCron(client) {
  console.log("[aion2SiegeAlert] Initializing Siege Checker & Participant Reminder Cron (Runs every 30s)...");

  setInterval(async () => {
    try {
      const now = new Date();
      // Saudi Arabia Time (Asia/Riyadh, UTC+3)
      const ksaDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }); // e.g. "2026-11-06"
      const ksaHour = Number(now.toLocaleTimeString("en-US", { timeZone: "Asia/Riyadh", hour12: false, hour: "numeric" }));
      const ksaMin = Number(now.toLocaleTimeString("en-US", { timeZone: "Asia/Riyadh", hour12: false, minute: "numeric" }));

      // 1. Daily 10:00 AM Announcement Check
      if (ksaHour === 10 && ksaMin === 0) {
        const data = loadData();
        data._meta = data._meta || {};

        if (data._meta.lastDailyPost !== ksaDateStr) {
          console.log(`[aion2SiegeAlert] 10:00 AM KSA Triggered for ${ksaDateStr}. Checking Shugo schedule...`);
          data._meta.lastDailyPost = ksaDateStr;
          saveData(data);

          const result = await publishSiegeAnnouncement(client, {
            channelId: TARGET_CHANNEL_ID,
            forceSend: false
          });

          if (result) {
            console.log(`[aion2SiegeAlert] Successfully posted daily siege alert for ${ksaDateStr} in channel ${TARGET_CHANNEL_ID}`);
          } else {
            console.log(`[aion2SiegeAlert] No siege scheduled for today (${ksaDateStr}).`);
          }
        }
      }

      // 2. Active Reminders Check (2-hour and 5-minute checks for registered participants)
      await checkSiegeReminders(client);

    } catch (err) {
      console.error("[aion2SiegeAlert] Error in Siege Cron ticker:", err);
    }
  }, 30 * 1000);
}

export async function handleInteraction(interaction) {
  const customId = interaction.customId;
  const messageId = interaction.message.id;

  if (customId === "aion2_siege_list") {
    const attendees = getAttendees(messageId);
    if (attendees.length === 0) {
      return interaction.reply({
        content: "📋 **قائمة الحضور:** لا يوجد أي لاعبين مسجلين حضورهم حتى الآن. كن أول من يسجل بالضغط على ✅!",
        ephemeral: true
      });
    }

    const mentions = attendees.map((id, index) => `${index + 1}. <@${id}>`).join("\n");
    return interaction.reply({
      content: `📋 **قائمة الحضور المؤكدين للحصار (${attendees.length} لاعب):**\n\n${mentions}`,
      ephemeral: true
    });
  }

  if (customId === "aion2_siege_attend") {
    const userId = interaction.user.id;
    const data = loadData();
    let attendees = Array.isArray(data[messageId]) ? [...data[messageId]] : [];

    const isAlreadyAttending = attendees.includes(userId);

    if (isAlreadyAttending) {
      attendees = attendees.filter(id => id !== userId);
      data[messageId] = attendees;
      saveData(data);

      await interaction.reply({
        content: "⚠️ **تم إلغاء تسجيل حضورك في الحصار.** إذا رغبت بالحضور مجدداً اضغط على الزر في أي وقت.",
        ephemeral: true
      });
    } else {
      attendees.push(userId);
      data[messageId] = attendees;
      saveData(data);

      await interaction.reply({
        content: "✅ **كفو يا بطل! تم تسجيل حضورك في الحصار بنجاح.**\nنراك في المعركة، جهز بوفاتك وعربتك القتالية! 🔥⚔️",
        ephemeral: true
      });
    }

    // Update message components and embed with the new count
    try {
      const originalEmbed = interaction.message.embeds[0];
      if (originalEmbed) {
        const embedBuilder = EmbedBuilder.from(originalEmbed);

        // Update the attendees count in embed description
        let desc = embedBuilder.data.description || "";
        const countRegex = /(👥\s*\*\*عدد الحضور المؤكدين:\*\*\s*`)\d+(\s*لاعب\s*✅?`)/;
        if (countRegex.test(desc)) {
          desc = desc.replace(countRegex, `$1${attendees.length}$2`);
        } else {
          desc += `\n\n👥 **عدد الحضور المؤكدين:** \`${attendees.length} لاعب\``;
        }
        embedBuilder.setDescription(desc);

        // Ensure image points to direct URL instead of old local attachment://
        embedBuilder.setImage(SIEGE_BANNER_URL);

        const newRow = buildSiegeComponents(attendees.length);
        const editPayload = {
          embeds: [embedBuilder],
          components: [newRow]
        };

        if (interaction.message.attachments && (interaction.message.attachments.size > 0 || interaction.message.attachments.length > 0)) {
          editPayload.attachments = [];
        }

        await interaction.message.edit(editPayload);
      }
    } catch (editErr) {
      console.warn("[aion2SiegeAlert] Failed to update message embed count:", editErr.message);
    }
  }
}

export default {
  TARGET_CHANNEL_ID,
  M3RGEEN_ROLE_ID,
  VOICE_CHANNEL_ID,
  SIEGE_BANNER_URL,
  getAttendees,
  buildSiegeComponents,
  fetchShugoTimers,
  getEuropeSiegeSchedule,
  buildSiegeAnnouncementEmbed,
  registerActiveSiege,
  checkSiegeReminders,
  publishSiegeAnnouncement,
  startDailySiegeCron,
  handleInteraction
};
