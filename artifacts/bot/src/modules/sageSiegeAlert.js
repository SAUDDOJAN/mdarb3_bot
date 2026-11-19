import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { query } from "../database/index.js";

// ─── Constants & Configuration ───────────────────────────────────────────────
export const SAGE_GUILD_ID = "1507696012410749030";
export const SAGE_ORDERS_CHANNEL_ID = "1507705678809272410"; // #📣┊الأوامر
export const SAGE_VOICE_CHANNEL_ID = "1571540894061039788";  // #🏟️┊سيج-الحلف
export const SAGE_REGISTRATION_CHANNEL_ID = "1507702008906252310"; // #📝┊التسجيل
export const SAGE_ALLIANCE_MEMBER_ROLE_ID = "1571516616435302410"; // @⚔️ ┃ Alliance Member

export const SIEGE_BANNER_URL =
  "https://raw.githubusercontent.com/SAUDDOJAN/mdarb3_bot/main/artifacts/bot/assets/aion2_siege_banner_v2.jpg";

// 2.5 hours (150 minutes) before Siege start = official gathering & DM alert trigger
export const GATHERING_LEAD_SECONDS = 150 * 60;

export const CLASS_EMOJIS = {
  Templar:      "<:Templar:1504472027724255414>",
  Gladiator:    "<:Gladiator:1504471947831017532>",
  Assassin:     "<:Assassin:1504471833695748156>",
  Ranger:       "<:Ranger:1504471982006341783>",
  Sorcerer:     "<:Sorcerer:1504472006610124961>",
  Spiritmaster: "<:Elementalist:1504471920219783209>",
  Cleric:       "<:Cleric:1504471892755611678>",
  Chanter:      "<:Chanter:1504471867141128272>",
  Other:        "⚔️",
};

const MELEE_CLASSES = ["Templar", "Gladiator", "Assassin"];
const RANGED_CLASSES = ["Ranger", "Sorcerer", "Spiritmaster"];
const HEALER_CLASSES = ["Cleric", "Chanter"];

let dbInitPromise = null;

/**
 * Ensures isolated PostgreSQL tables for SAGE Alliance Siege announcements, RSVPs, and DM alerts exist.
 */
export async function initSageSiegeAlertDB() {
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS sage_siege_events (
        message_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        siege_unix BIGINT NOT NULL,
        gathering_unix BIGINT NOT NULL,
        notes TEXT,
        is_sample BOOLEAN DEFAULT FALSE,
        reminded_1h30m BOOLEAN DEFAULT FALSE,
        reminded_2h BOOLEAN DEFAULT FALSE,
        reminded_5m BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sage_siege_responses (
        id SERIAL PRIMARY KEY,
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        character_name TEXT,
        class_name TEXT,
        guild_name TEXT,
        rsvp_status TEXT,
        remind_me BOOLEAN DEFAULT FALSE,
        dm_reminded BOOLEAN DEFAULT FALSE,
        signup_order INT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (message_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sage_siege_resp_msg ON sage_siege_responses (message_id);

      CREATE TABLE IF NOT EXISTS sage_siege_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  })().catch((err) => {
    dbInitPromise = null;
    console.error("[sageSiegeAlert] Failed to initialize PostgreSQL tables:", err);
    throw err;
  });

  return dbInitPromise;
}

export function normalizeClassName(raw) {
  if (!raw) return "Other";
  const str = String(raw).trim().toLowerCase();
  if (str.includes("temp") || str.includes("تمبل")) return "Templar";
  if (str.includes("glad") || str.includes("جلاد")) return "Gladiator";
  if (str.includes("ass") || str.includes("أساس") || str.includes("اساس") || str === "sin") return "Assassin";
  if (str.includes("rang") || str.includes("رينج") || str.includes("رامي")) return "Ranger";
  if (str.includes("sorc") || str.includes("ساحر") || str.includes("سورس")) return "Sorcerer";
  if (str.includes("spirit") || str.includes("elem") || str.includes("سبير") || str.includes("عنصر")) return "Spiritmaster";
  if (str.includes("cler") || str.includes("كلير")) return "Cleric";
  if (str.includes("chan") || str.includes("تشان") || str.includes("شنتر")) return "Chanter";
  return "Other";
}

/**
 * Builds the 4 interactive buttons with SAGE custom IDs:
 * 1. أنا معكم | 2. يمكن أجي | 3. ما أقدر أجي | 4. نبهني
 */
export function buildSageSiegeComponents({
  attendingCount = 0,
  maybeCount = 0,
  absentCount = 0,
  remindCount = 0,
} = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sage_siege_attend")
      .setLabel(`أنا معكم (${attendingCount})`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("sage_siege_maybe")
      .setLabel(`يمكن أجي (${maybeCount})`)
      .setEmoji("🤔")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("sage_siege_absent")
      .setLabel(`ما أقدر أجي (${absentCount})`)
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("sage_siege_remind")
      .setLabel(`نبهني (${remindCount})`)
      .setEmoji("🔔")
      .setStyle(ButtonStyle.Primary)
  );
}

/**
 * Fetch timer schedule directly from Shugo.gg API
 */
export async function fetchShugoTimers() {
  const res = await fetch("https://shugo.gg/timers.json", {
    headers: { Accept: "application/json" },
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
    times: ["21:00", "21:05", "21:10"],
  };

  try {
    const data = await fetchShugoTimers();
    const siegeEvent = data.events?.find((e) => e.id === "artifact-siege");
    if (siegeEvent?.schedules?.["global-eu"]) {
      euSchedule = siegeEvent.schedules["global-eu"];
    }
  } catch (err) {
    console.warn("[sageSiegeAlert] Warning: Failed to fetch live Shugo timers, falling back to cached schedule:", err.message);
  }

  const siegeDays = (euSchedule.days || ["thu", "sat"]).map((d) => d.toLowerCase());
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

  const approxDate = new Date(
    `${year}-${month}-${day}T${String(sHour).padStart(2, "0")}:${String(sMin).padStart(2, "0")}:00Z`
  );
  const utcDate = new Date(approxDate.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(approxDate.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const offsetMin = (tzDate - utcDate) / (60 * 1000);

  const siegeUtcMs = approxDate.getTime() - offsetMin * 60 * 1000;
  const siegeUnix = Math.floor(siegeUtcMs / 1000);
  const gatheringUnix = siegeUnix - GATHERING_LEAD_SECONDS;

  return {
    isTodaySiege,
    daysToAdd,
    siegeUnix,
    gatheringUnix,
    schedule: euSchedule,
  };
}

function formatClassColumnValue(className, entries) {
  const emoji = CLASS_EMOJIS[className] || CLASS_EMOJIS.Other;
  if (!entries || entries.length === 0) {
    return `${emoji} *— شاغر*\n\u200b`;
  }

  const lines = [];
  let len = 0;
  let hidden = 0;

  for (const item of entries) {
    const numStr = String(item.signup_order || 0).padStart(2, " ");
    const line = `${emoji} \`${numStr}\` **${item.character_name}**`;
    if (len + line.length + 30 > 980) {
      hidden++;
      continue;
    }
    lines.push(line);
    len += line.length + 1;
  }

  if (hidden > 0) {
    lines.push(`*+ ${hidden} آخرين...*`);
  }

  return `${lines.join("\n")}\n\u200b`;
}

function formatCompactRsvpList(entries) {
  if (!entries || entries.length === 0) {
    return "*— لا يوجد*";
  }

  const lines = [];
  let len = 0;
  let hidden = 0;

  for (const item of entries) {
    const normClass = normalizeClassName(item.class_name);
    const emoji = CLASS_EMOJIS[normClass] || CLASS_EMOJIS.Other;
    const numStr = item.signup_order ? `\`${item.signup_order}\` ` : "";
    const guildTag = item.guild_name ? ` [${item.guild_name}]` : "";
    const line = `${emoji} ${numStr}${item.character_name}${guildTag}`;
    if (len + line.length + 25 > 950) {
      hidden++;
      continue;
    }
    lines.push(line);
    len += line.length + 1;
  }

  if (hidden > 0) {
    lines.push(`*+ ${hidden} آخرين...*`);
  }

  return lines.join("\n");
}

/**
 * Fetches full RSVP & reminder snapshot from PostgreSQL for a SAGE Siege message.
 */
export async function getSageSiegeSnapshot(messageId) {
  await initSageSiegeAlertDB();
  const [eventRes, respRes] = await Promise.all([
    query(`SELECT * FROM sage_siege_events WHERE message_id = $1 LIMIT 1`, [messageId]),
    query(
      `SELECT * FROM sage_siege_responses WHERE message_id = $1 ORDER BY signup_order ASC NULLS LAST, id ASC`,
      [messageId]
    ),
  ]);

  const rows = respRes.rows;
  const attending = rows.filter((r) => r.rsvp_status === "ATTENDING");
  const maybe = rows.filter((r) => r.rsvp_status === "MAYBE");
  const absent = rows.filter((r) => r.rsvp_status === "ABSENT");
  const reminders = rows.filter((r) => r.remind_me === true);

  return {
    event: eventRes.rows[0] || null,
    attending,
    maybe,
    absent,
    reminders,
    counts: {
      attendingCount: attending.length,
      maybeCount: maybe.length,
      absentCount: absent.length,
      remindCount: reminders.length,
    },
  };
}

/**
 * Formats a Unix timestamp strictly in the Gregorian calendar (Asia/Riyadh) with day name.
 */
export function formatGregorianDate(unixSeconds) {
  const date = new Date(Number(unixSeconds) * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  const weekdayAr = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
  }).format(date);
  return `${weekdayAr} ${get("day")}-${get("month")}-${get("year")}`;
}

/**
 * Builds the Raid-Helper style 3-column SAGE Alliance Siege announcement embed.
 */
export function buildSageSiegeAnnouncementEmbed({
  siegeUnix,
  gatheringUnix,
  notes = null,
  attending = [],
  maybe = [],
  absent = [],
  remindCount = 0,
  attendeeCount = null,
}) {
  const byClass = {
    Templar: [],
    Gladiator: [],
    Assassin: [],
    Ranger: [],
    Sorcerer: [],
    Spiritmaster: [],
    Cleric: [],
    Chanter: [],
    Other: [],
  };

  for (const player of attending) {
    const cls = normalizeClassName(player.class_name);
    if (byClass[cls]) {
      byClass[cls].push(player);
    } else {
      byClass.Other.push(player);
    }
  }

  const totalAttending = attendeeCount !== null ? attendeeCount : attending.length;
  const meleeTotal = MELEE_CLASSES.reduce((sum, cls) => sum + byClass[cls].length, 0);
  const rangedTotal = RANGED_CLASSES.reduce((sum, cls) => sum + byClass[cls].length, 0);
  const healersTotal = HEALER_CLASSES.reduce((sum, cls) => sum + byClass[cls].length, 0);

  // Guild breakdown for attending members
  const guildCounts = {};
  for (const player of attending) {
    const g = player.guild_name ? player.guild_name.trim() : "لاعب فردي";
    guildCounts[g] = (guildCounts[g] || 0) + 1;
  }

  if (guildCounts["M3RGEEN"] === undefined) {
    guildCounts["M3RGEEN"] = 0;
  }

  const sortedGuilds = Object.keys(guildCounts).sort((a, b) => {
    if (a.toLowerCase().includes("m3rgeen")) return -1;
    if (b.toLowerCase().includes("m3rgeen")) return 1;
    return guildCounts[b] - guildCounts[a];
  });

  const guildSummaryLines = sortedGuilds.map((g) => {
    const isSolo = g.toLowerCase().includes("solo") || g.includes("فردي");
    const icon = isSolo ? "⚠️" : "⚔️";
    return `${icon} **${g}:** \`${guildCounts[g]}\``;
  });

  const guildBreakdownText = `\n\n📊 **المسجلون حسب القيلد:**\n${guildSummaryLines.join("\n")}`;

  const descLines = [
    "**تعلن قيادة تحالف الحصارات عن انطلاق عمليات حصار الأبيس (Artifact Siege).**",
    "على جميع مقاتلي وقادة القيلدات المتحالفة والأعضاء المعتمدين الالتزام التام بالتوقيتات والتواجد في الروم الصوتي قبل التجمع.",
    "",
    "📍 **مكان التجمع:** `قاعدة الأبيس جانب الكورة المتوهجة`",
    `🔊 **روم التجمع الصوتي:** <#${SAGE_VOICE_CHANNEL_ID}> ([دخول مباشر للروم الصوتي](https://discord.com/channels/${SAGE_GUILD_ID}/${SAGE_VOICE_CHANNEL_ID}))`,
  ];

  if (notes) {
    descLines.push("", `📝 **توجيهات القيادة:**\n${notes}`);
  }

  descLines.push("", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const embed = new EmbedBuilder()
    .setColor(0x992d22)
    .setTitle("⚔️ إعلان حصار AION 2 | نداء الحرب لتحالف الحصارات (Siege Alliance)")
    .setDescription(descLines.join("\n"))
    // Row 1: Total Count | Date & Siege Time | Gathering & Remaining Time
    .addFields(
      {
        name: "👥 إجمالي الحضور",
        value: `**${totalAttending}** مشارك\n\u200b`,
        inline: true,
      },
      {
        name: "📅 التاريخ ووقت السيج",
        value: `**${formatGregorianDate(siegeUnix)}**\n⚔️ السيج: **<t:${siegeUnix}:t>**\n\u200b`,
        inline: true,
      },
      {
        name: "⏳ التجمع والوقت المتبقي",
        value: `🌀 التجمع: **<t:${gatheringUnix}:t>**\n⏰ المتبقي: **<t:${siegeUnix}:R>**${guildBreakdownText}\n\u200b`,
        inline: true,
      }
    )
    // Row 2: Archetype Summary (Melee | Ranged | Healers)
    .addFields(
      {
        name: "⚔️ Melee",
        value: `**${meleeTotal}**\n\u200b`,
        inline: true,
      },
      {
        name: "🏹 Ranged",
        value: `**${rangedTotal}**\n\u200b`,
        inline: true,
      },
      {
        name: "💚 Healers & Sup",
        value: `**${healersTotal}**\n\u200b`,
        inline: true,
      }
    )
    // Row 3: Tier 1 Classes
    .addFields(
      {
        name: `${CLASS_EMOJIS.Templar} **Templar · Tank (${byClass.Templar.length}) :**`,
        value: formatClassColumnValue("Templar", byClass.Templar),
        inline: true,
      },
      {
        name: `${CLASS_EMOJIS.Ranger} **Ranger (${byClass.Ranger.length}) :**`,
        value: formatClassColumnValue("Ranger", byClass.Ranger),
        inline: true,
      },
      {
        name: `${CLASS_EMOJIS.Cleric} **Cleric (${byClass.Cleric.length}) :**`,
        value: formatClassColumnValue("Cleric", byClass.Cleric),
        inline: true,
      }
    )
    // Row 4: Tier 2 Classes
    .addFields(
      {
        name: `${CLASS_EMOJIS.Gladiator} **Gladiator (${byClass.Gladiator.length}) :**`,
        value: formatClassColumnValue("Gladiator", byClass.Gladiator),
        inline: true,
      },
      {
        name: `${CLASS_EMOJIS.Sorcerer} **Sorcerer (${byClass.Sorcerer.length}) :**`,
        value: formatClassColumnValue("Sorcerer", byClass.Sorcerer),
        inline: true,
      },
      {
        name: `${CLASS_EMOJIS.Chanter} **Chanter (${byClass.Chanter.length}) :**`,
        value: formatClassColumnValue("Chanter", byClass.Chanter),
        inline: true,
      }
    )
    // Row 5: Tier 3 Classes
    .addFields(
      {
        name: `${CLASS_EMOJIS.Assassin} **Assassin (${byClass.Assassin.length}) :**`,
        value: formatClassColumnValue("Assassin", byClass.Assassin),
        inline: true,
      },
      {
        name: `${CLASS_EMOJIS.Spiritmaster} **Spiritmaster (${byClass.Spiritmaster.length}) :**`,
        value: formatClassColumnValue("Spiritmaster", byClass.Spiritmaster),
        inline: true,
      },
      byClass.Other.length > 0
        ? {
            name: `${CLASS_EMOJIS.Other} **غير مصنّف (${byClass.Other.length}) :**`,
            value: formatClassColumnValue("Other", byClass.Other),
            inline: true,
          }
        : {
            name: "\u200b",
            value: "\u200b",
            inline: true,
          }
    )
    // Row 6: Tentative / Absent / Remind counters
    .addFields(
      {
        name: `🤔 يمكن أجي (${maybe.length}) :`,
        value: formatCompactRsvpList(maybe),
        inline: true,
      },
      {
        name: `❌ ما أقدر أجي (${absent.length}) :`,
        value: formatCompactRsvpList(absent),
        inline: true,
      },
      {
        name: `🔔 مسجلو التنبيه (${remindCount}) :`,
        value: `**${remindCount}** لاعب *(DM قبل السيج بـ 2.5 ساعة)*`,
        inline: true,
      }
    )
    .setImage(SIEGE_BANNER_URL)
    .setFooter({ text: "تحالف الحصارات • Siege Alliance • اختر حالتك من الأزرار بالأسفل" })
    .setTimestamp();

  return embed;
}

/**
 * Registers an active Siege announcement in PostgreSQL for RSVPs and automated reminders.
 */
export async function registerActiveSageSiege({
  messageId,
  channelId,
  siegeUnix,
  gatheringUnix,
  notes = null,
  isSample = false,
}) {
  await initSageSiegeAlertDB();
  await query(
    `INSERT INTO sage_siege_events (
      message_id, channel_id, siege_unix, gathering_unix, notes, is_sample,
      reminded_1h30m, reminded_2h, reminded_5m
    ) VALUES ($1, $2, $3, $4, $5, $6, false, false, false)
    ON CONFLICT (message_id) DO UPDATE SET
      channel_id = EXCLUDED.channel_id,
      siege_unix = EXCLUDED.siege_unix,
      gathering_unix = EXCLUDED.gathering_unix,
      notes = EXCLUDED.notes,
      is_sample = EXCLUDED.is_sample`,
    [messageId, channelId, siegeUnix, gatheringUnix, notes, isSample]
  );

  console.log(`[sageSiegeAlert] Registered sage siege event: Message ${messageId}, Siege Unix: ${siegeUnix}`);
}

/**
 * Sends instant confirmation DM or T-2.5h gathering DM alert.
 */
async function sendSageSiegeDmToUser(user, { siegeUnix, gatheringUnix, isScheduledAlert = false }) {
  const title = isScheduledAlert
    ? "🚨 تنبيه الحصار — حان وقت التجمع الآن! (متبقي ساعتين ونصف)"
    : "🔔 تم تفعيل تنبيه السيج بنجاح — تحالف الحصارات";

  const leadLine = isScheduledAlert
    ? "**بدأ الآن وقت التجمع للحصار (متبقي ساعتين ونصف فقط على انطلاق السيج — سارعوا بالدخول قبل إغلاق الأبيس)!**"
    : "تم تسجيلك في قائمة التنبيهات الخاصة بالسيج بنجاح، وسيصلك تذكير تلقائي آخر على الخاص **قبل انطلاق السيج بساعتين ونصف (وقت التجمع)**.";

  const dmEmbed = new EmbedBuilder()
    .setColor(isScheduledAlert ? 0xe67e22 : 0x3498db)
    .setTitle(title)
    .setDescription(
      [
        leadLine,
        "",
        `📅 **تاريخ الحصار:** ${formatGregorianDate(siegeUnix)}`,
        `🌀 **وقت التجمع (قبل الحدث بـ 2.5 ساعة):** <t:${gatheringUnix}:t> (<t:${gatheringUnix}:R>)`,
        `⚔️ **انطلاق الحصار:** <t:${siegeUnix}:t> (<t:${siegeUnix}:R>)`,
        `📍 **مكان التجمع:** \`قاعدة الأبيس جانب الكورة المتوهجة\``,
        `🔊 **روم التجمع الصوتي:** <#${SAGE_VOICE_CHANNEL_ID}> ([دخول مباشر للروم الصوتي](https://discord.com/channels/${SAGE_GUILD_ID}/${SAGE_VOICE_CHANNEL_ID}))`,
        "",
        "🛡️ جهّز الجرع والأطعمة والبوفات والعتاد مسبقاً — ننتظرك في الساحة!",
      ].join("\n")
    )
    .setFooter({ text: "تحالف الحصارات • نظام تنبيهات الحصار التلقائي" })
    .setTimestamp();

  await user.send({ embeds: [dmEmbed] });
}

/**
 * Sends T-2.5h gathering DMs to every player who pressed "🔔 نبهني".
 */
async function send1h30mDmReminders(client, siege) {
  const res = await query(
    `SELECT user_id FROM sage_siege_responses
     WHERE message_id = $1 AND remind_me = TRUE AND dm_reminded = FALSE`,
    [siege.message_id]
  );

  let sentCount = 0;
  for (const row of res.rows) {
    try {
      const user = await client.users.fetch(row.user_id).catch(() => null);
      if (user) {
        await sendSageSiegeDmToUser(user, {
          siegeUnix: Number(siege.siege_unix),
          gatheringUnix: Number(siege.gathering_unix),
          isScheduledAlert: true,
        });
        sentCount++;
      }
      await query(
        `UPDATE sage_siege_responses SET dm_reminded = TRUE WHERE message_id = $1 AND user_id = $2`,
        [siege.message_id, row.user_id]
      );
    } catch (err) {
      console.warn(`[sageSiegeAlert] Could not DM user ${row.user_id} at T-2.5h:`, err.message);
    }
  }

  console.log(`[sageSiegeAlert] T-2.5h DM reminders processed for message ${siege.message_id}: sent ${sentCount}/${res.rowCount}`);
}

/**
 * Send 2-Hour channel reminder mentioning confirmed & tentative participants.
 */
async function send2HourReminder(client, siege) {
  const channel = client.channels.cache.get(siege.channel_id) ?? (await client.channels.fetch(siege.channel_id).catch(() => null));
  if (!channel || !channel.isTextBased()) return;

  const snap = await getSageSiegeSnapshot(siege.message_id);
  const participantIds = [...new Set([...snap.attending, ...snap.maybe].map((p) => p.user_id))];
  const mentionsText = participantIds.length > 0 ? participantIds.map((id) => `<@${id}>`).join(" ") : "@everyone";

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("⏳ تذكير بحرب الحصار (AION 2 Siege) | متبقي ساعتان!")
    .setDescription(
      [
        "**نداء إلى جميع الأبطال المشاركين في الحصار اليوم:**",
        `⏰ **موعد انطلاق الحصار:** <t:${siege.siege_unix}:t> (<t:${siege.siege_unix}:R>)`,
        `🌀 **موعد التجمع (قبل الحدث بـ 2.5 ساعة):** <t:${siege.gathering_unix}:t> (<t:${siege.gathering_unix}:R>)`,
        `📍 **مكان التجمع:** \`قاعدة الأبيس جانب الكورة المتوهجة\``,
        `🔊 **الروم الصوتي:** <#${SAGE_VOICE_CHANNEL_ID}> ([دخول مباشر](https://discord.com/channels/${SAGE_GUILD_ID}/${SAGE_VOICE_CHANNEL_ID}))`,
        "",
        "🛡️ **تذكير بالتعليمات الهامة:**",
        "• التجمع في الروم الصوتي وقاعدة الأبيس قبل انطلاق الحصار بساعتين ونصف (سارع بالدخول قبل إغلاق الأبيس).",
        "• تجهيز كافة الجرع والأطعمة وبوفات الحرب والعتاد مسبقاً.",
        "",
        `👥 **المشاركون المسجلون (${snap.attending.length} مؤكد • ${snap.maybe.length} محتمل):**`,
        mentionsText,
      ].join("\n")
    )
    .setFooter({ text: "تحالف الحصارات • استعدوا للحرب" })
    .setTimestamp();

  const originalMsg = await channel.messages.fetch(siege.message_id).catch(() => null);
  const payload = {
    content: `📢 **تنبيه للمشاركين في السيج (متبقي ساعتان):**\n${mentionsText}`,
    embeds: [embed],
    allowedMentions: { parse: ["users"] },
  };

  if (originalMsg) {
    await originalMsg.reply(payload).catch(async () => {
      await channel.send(payload).catch(() => {});
    });
  } else {
    await channel.send(payload).catch(() => {});
  }
}

/**
 * Send 5-Minute urgent reminder mentioning participants right before Siege starts.
 */
async function send5MinuteReminder(client, siege) {
  const channel = client.channels.cache.get(siege.channel_id) ?? (await client.channels.fetch(siege.channel_id).catch(() => null));
  if (!channel || !channel.isTextBased()) return;

  const snap = await getSageSiegeSnapshot(siege.message_id);
  const participantIds = [...new Set([...snap.attending, ...snap.maybe].map((p) => p.user_id))];
  const mentionsText = participantIds.length > 0 ? participantIds.map((id) => `<@${id}>`).join(" ") : "@everyone";

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("⚔️ نداء الحرب العاجل | بقيت 5 دقائق فقط على انطلاق السيج! 🔥")
    .setDescription(
      [
        "🚨 **السيج حيبدأ بعد 5 دقائق! خلوكم متجمعين في قاعدة الأبيس والروم الصوتي وجاهزين فوراً!**",
        "",
        `📍 **مكان التجمع:** \`قاعدة الأبيس جانب الكورة المتوهجة\``,
        `🔊 **الروم الصوتي:** <#${SAGE_VOICE_CHANNEL_ID}> ([انتقال فوري للروم الصوتي](https://discord.com/channels/${SAGE_GUILD_ID}/${SAGE_VOICE_CHANNEL_ID}))`,
        `⏰ **موعد البدء:** <t:${siege.siege_unix}:t> (<t:${siege.siege_unix}:R>)`,
        "",
        `👥 **المحاربون المشاركون (${snap.attending.length} مؤكد):**`,
        mentionsText,
      ].join("\n")
    )
    .setFooter({ text: "تحالف الحصارات • نداء الحرب" })
    .setTimestamp();

  const originalMsg = await channel.messages.fetch(siege.message_id).catch(() => null);
  const payload = {
    content: `⚔️ **تنبيه عاجل للمشاركين (5 دقائق على بدء السيج):**\n${mentionsText}`,
    embeds: [embed],
    allowedMentions: { parse: ["users"] },
  };

  if (originalMsg) {
    await originalMsg.reply(payload).catch(async () => {
      await channel.send(payload).catch(() => {});
    });
  } else {
    await channel.send(payload).catch(() => {});
  }
}

/**
 * Checks active sieges for T-2.5h DM alert, T-2h channel, and T-5m channel reminders.
 */
export async function checkSageSiegeReminders(client) {
  await initSageSiegeAlertDB();
  const nowUnix = Math.floor(Date.now() / 1000);

  const activeRes = await query(
    `SELECT * FROM sage_siege_events WHERE siege_unix > $1 AND is_sample = FALSE`,
    [nowUnix - 7200]
  );

  for (const siege of activeRes.rows) {
    const siegeUnix = Number(siege.siege_unix);
    const timeUntilSiege = siegeUnix - nowUnix;

    // 1. T - 2 Hours Channel Reminder
    if (!siege.reminded_2h && timeUntilSiege <= 2 * 3600 && timeUntilSiege > 5 * 60) {
      await send2HourReminder(client, siege).catch((err) => {
        console.error("[sageSiegeAlert] Error sending 2h reminder:", err);
      });
      await query(`UPDATE sage_siege_events SET reminded_2h = TRUE WHERE message_id = $1`, [siege.message_id]);
    }

    // 2. T - 2.5 Hours (150 min) Gathering Moment DM Alerts for "نبهني" subscribers
    if (!siege.reminded_1h30m && timeUntilSiege <= GATHERING_LEAD_SECONDS && timeUntilSiege > -1800) {
      await send1h30mDmReminders(client, siege).catch((err) => {
        console.error("[sageSiegeAlert] Error sending T-2.5h DM reminders:", err);
      });
      await query(`UPDATE sage_siege_events SET reminded_1h30m = TRUE WHERE message_id = $1`, [siege.message_id]);
    }

    // 3. T - 5 Minutes Urgent Channel Reminder
    if (!siege.reminded_5m && timeUntilSiege <= 5 * 60 && timeUntilSiege > -1800) {
      await send5MinuteReminder(client, siege).catch((err) => {
        console.error("[sageSiegeAlert] Error sending 5m reminder:", err);
      });
      await query(`UPDATE sage_siege_events SET reminded_5m = TRUE WHERE message_id = $1`, [siege.message_id]);
    }
  }
}

/**
 * Publish the SAGE Alliance Siege announcement into Discord.
 */
export async function publishSageSiegeAnnouncement(
  client,
  {
    channelId = SAGE_ORDERS_CHANNEL_ID,
    notes = null,
    forceSend = false,
    forceNextSchedule = false,
    isSample = false,
    initialResponses = [],
  } = {}
) {
  await initSageSiegeAlertDB();
  const channel = client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Target channel ${channelId} not found or not text-based.`);
  }

  const siegeInfo = await getEuropeSiegeSchedule(forceNextSchedule);
  if (!siegeInfo.isTodaySiege && !forceSend) {
    console.log("[sageSiegeAlert] Today is not a siege day in Europe. Skipping announcement.");
    return null;
  }

  const attending = initialResponses.filter((r) => r.rsvp_status === "ATTENDING");
  const maybe = initialResponses.filter((r) => r.rsvp_status === "MAYBE");
  const absent = initialResponses.filter((r) => r.rsvp_status === "ABSENT");
  const reminders = initialResponses.filter((r) => r.remind_me === true);

  const embed = buildSageSiegeAnnouncementEmbed({
    siegeUnix: siegeInfo.siegeUnix,
    gatheringUnix: siegeInfo.gatheringUnix,
    notes,
    attending,
    maybe,
    absent,
    remindCount: reminders.length,
  });

  const row = buildSageSiegeComponents({
    attendingCount: attending.length,
    maybeCount: maybe.length,
    absentCount: absent.length,
    remindCount: reminders.length,
  });

  const sendPayload = {
    content: `<@&${SAGE_ALLIANCE_MEMBER_ROLE_ID}>`,
    embeds: [embed],
    components: [row],
  };

  const sentMessage = await channel.send(sendPayload);

  await registerActiveSageSiege({
    messageId: sentMessage.id,
    channelId: channel.id,
    siegeUnix: siegeInfo.siegeUnix,
    gatheringUnix: siegeInfo.gatheringUnix,
    notes,
    isSample,
  });

  for (const item of initialResponses) {
    await query(
      `INSERT INTO sage_siege_responses (
        message_id, user_id, character_name, class_name, guild_name, rsvp_status, remind_me, signup_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (message_id, user_id) DO UPDATE SET
        character_name = EXCLUDED.character_name,
        class_name = EXCLUDED.class_name,
        guild_name = EXCLUDED.guild_name,
        rsvp_status = EXCLUDED.rsvp_status,
        remind_me = EXCLUDED.remind_me,
        signup_order = EXCLUDED.signup_order`,
      [
        sentMessage.id,
        item.user_id,
        item.character_name,
        normalizeClassName(item.class_name),
        item.guild_name || null,
        item.rsvp_status || null,
        Boolean(item.remind_me),
        item.signup_order || null,
      ]
    );
  }

  return sentMessage;
}

/**
 * Daily Cron running every 30s (10:00 AM KSA Siege announcement + T-2.5h DM / T-2h / T-5m checks)
 */
export function startDailySageSiegeCron(client) {
  console.log("[sageSiegeAlert] Initializing SAGE Alliance Siege Checker & Participant Reminder Cron (Runs every 30s)...");
  initSageSiegeAlertDB().catch(() => {});

  let dailyPostInFlight = false;

  setInterval(async () => {
    try {
      await initSageSiegeAlertDB();
      const now = new Date();
      const ksaDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
      const ksaHour = Number(now.toLocaleTimeString("en-US", { timeZone: "Asia/Riyadh", hour12: false, hour: "numeric" }));
      const ksaMin = Number(now.toLocaleTimeString("en-US", { timeZone: "Asia/Riyadh", hour12: false, minute: "numeric" }));

      // 1. Daily 10:00-10:04 AM KSA Announcement Check
      if (ksaHour === 10 && ksaMin >= 0 && ksaMin < 5 && !dailyPostInFlight) {
        const metaRes = await query(`SELECT value FROM sage_siege_meta WHERE key = 'last_daily_post' LIMIT 1`);
        const lastDailyPost = metaRes.rows[0]?.value;

        if (lastDailyPost !== ksaDateStr) {
          dailyPostInFlight = true;
          try {
            console.log(`[sageSiegeAlert] 10:00 AM KSA Triggered for ${ksaDateStr}. Checking Shugo schedule...`);
            const result = await publishSageSiegeAnnouncement(client, {
              channelId: SAGE_ORDERS_CHANNEL_ID,
              forceSend: false,
            });

            await query(
              `INSERT INTO sage_siege_meta (key, value, updated_at)
               VALUES ('last_daily_post', $1, NOW())
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
              [ksaDateStr]
            );

            if (result) {
              console.log(`[sageSiegeAlert] Successfully posted daily sage siege alert for ${ksaDateStr} in channel ${SAGE_ORDERS_CHANNEL_ID}`);
            } else {
              console.log(`[sageSiegeAlert] No siege scheduled for today (${ksaDateStr}).`);
            }
          } finally {
            dailyPostInFlight = false;
          }
        }
      }

      // 2. Active Reminders Check (T-2.5h DM alerts, T-2h channel, T-5m urgent channel)
      await checkSageSiegeReminders(client);
    } catch (err) {
      console.error("[sageSiegeAlert] Error in SAGE Siege Cron ticker:", err);
    }
  }, 30 * 1000);
}

/**
 * Ensures the clicked message exists in sage_siege_events.
 */
async function ensureSageSiegeEventRow(message) {
  const existing = await query(`SELECT * FROM sage_siege_events WHERE message_id = $1 LIMIT 1`, [message.id]);
  if (existing.rows[0]) return existing.rows[0];

  const sched = await getEuropeSiegeSchedule(false);
  await registerActiveSageSiege({
    messageId: message.id,
    channelId: message.channelId,
    siegeUnix: sched.siegeUnix,
    gatheringUnix: sched.gatheringUnix,
  });
  const created = await query(`SELECT * FROM sage_siege_events WHERE message_id = $1 LIMIT 1`, [message.id]);
  return created.rows[0];
}

async function refreshSageSiegeMessage(message, eventRow) {
  const snap = await getSageSiegeSnapshot(message.id);
  const embed = buildSageSiegeAnnouncementEmbed({
    siegeUnix: Number(eventRow.siege_unix),
    gatheringUnix: Number(eventRow.gathering_unix),
    notes: eventRow.notes || null,
    attending: snap.attending,
    maybe: snap.maybe,
    absent: snap.absent,
    remindCount: snap.counts.remindCount,
  });

  const row = buildSageSiegeComponents(snap.counts);
  const editPayload = {
    embeds: [embed],
    components: [row],
  };

  if (message.attachments && message.attachments.size > 0) {
    editPayload.attachments = [];
  }

  await message.edit(editPayload);
}

/**
 * Handles button interactions from the SAGE Alliance Siege announcement embed.
 * Strictly verifies that the applicant is registered and accepted in sage_recruitment.
 */
export async function handleInteraction(interaction) {
  const customId = interaction.customId;
  const messageId = interaction.message.id;

  const rsvpButtonMap = {
    sage_siege_attend: "ATTENDING",
    sage_siege_maybe: "MAYBE",
    sage_siege_absent: "ABSENT",
  };

  const targetStatus = rsvpButtonMap[customId];
  const isRemindBtn = customId === "sage_siege_remind";
  if (!targetStatus && !isRemindBtn) return;

  await interaction.deferReply({ flags: 64 });
  await initSageSiegeAlertDB();

  const userId = interaction.user.id;

  // ─── STRICT VERIFICATION GUARD ──────────────────────────────────────────────
  // Verify that the user is an accepted member in the alliance (in a guild or accepted solo)
  const recruitRes = await query(
    "SELECT * FROM sage_recruitment WHERE user_id = $1 AND status = 'accepted' ORDER BY joined_at DESC LIMIT 1",
    [userId]
  );
  const acceptedMember = recruitRes.rows[0];

  if (!acceptedMember) {
    return await interaction.editReply({
      content:
        "⛔ **عذراً، التسجيل في السيج مخصص للأعضاء المعتمدين في التحالف فقط!**\n\n" +
        "⚠️ لم يتم العثور على طلب انضمام معتمد لك في تحالف الحصارات.\n" +
        `📌 يرجى التقديم أولاً عبر روم <#${SAGE_REGISTRATION_CHANNEL_ID}> (تحت أحد قيلدات التحالف أو كلاعب فردي مصرح له)، وفور اعتماد وقبول طلبك ستتمكن من تأكيد مشاركتك في الحصار.`,
    });
  }

  const characterName = acceptedMember.character_name;
  const className = normalizeClassName(acceptedMember.class_name);
  const guildName = acceptedMember.guild_name || "تحالف";

  const eventRow = await ensureSageSiegeEventRow(interaction.message);

  const existingRes = await query(
    `SELECT * FROM sage_siege_responses WHERE message_id = $1 AND user_id = $2 LIMIT 1`,
    [messageId, userId]
  );
  const existing = existingRes.rows[0] || null;

  let replyText = "";

  if (targetStatus) {
    const isTogglingOff = existing?.rsvp_status === targetStatus;
    const nextStatus = isTogglingOff ? null : targetStatus;

    let nextOrder = existing?.signup_order || null;
    if (nextStatus && !nextOrder) {
      const maxRes = await query(
        `SELECT COALESCE(MAX(signup_order), 0)::int AS max_ord FROM sage_siege_responses WHERE message_id = $1`,
        [messageId]
      );
      nextOrder = (maxRes.rows[0]?.max_ord || 0) + 1;
    }

    await query(
      `INSERT INTO sage_siege_responses (
        message_id, user_id, character_name, class_name, guild_name, rsvp_status, remind_me, signup_order, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, NOW())
      ON CONFLICT (message_id, user_id) DO UPDATE SET
        character_name = EXCLUDED.character_name,
        class_name = EXCLUDED.class_name,
        guild_name = EXCLUDED.guild_name,
        rsvp_status = EXCLUDED.rsvp_status,
        signup_order = COALESCE(sage_siege_responses.signup_order, EXCLUDED.signup_order),
        updated_at = NOW()`,
      [messageId, userId, characterName, className, guildName, nextStatus, nextOrder]
    );

    const emoji = CLASS_EMOJIS[className] || CLASS_EMOJIS.Other;
    if (isTogglingOff) {
      replyText = "⚠️ **تم إلغاء تسجيل حالتك الحالية في إعلان السيج.** يمكنك الاختيار مجدداً في أي وقت.";
    } else if (nextStatus === "ATTENDING") {
      replyText = `✅ **كفو يا بطل!** تم تسجيلك في قائمة **أنا معكم** باسم \`${characterName}\` [${guildName}] تحت كلاس ${emoji} **${className}**.`;
    } else if (nextStatus === "MAYBE") {
      replyText = `🤔 **تم تسجيل حالتك كـ (يمكن أجي)** باسم \`${characterName}\` [${guildName}] (${emoji} ${className}).`;
    } else {
      replyText = `❌ **تم تسجيل اعتذارك (ما أقدر أجي)** باسم \`${characterName}\` [${guildName}]. شكراً لإبلاغنا مسبقاً!`;
    }
  } else if (isRemindBtn) {
    const nextRemind = !(existing?.remind_me === true);

    await query(
      `INSERT INTO sage_siege_responses (
        message_id, user_id, character_name, class_name, guild_name, remind_me, dm_reminded, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW())
      ON CONFLICT (message_id, user_id) DO UPDATE SET
        character_name = EXCLUDED.character_name,
        class_name = EXCLUDED.class_name,
        guild_name = EXCLUDED.guild_name,
        remind_me = EXCLUDED.remind_me,
        dm_reminded = CASE WHEN EXCLUDED.remind_me = TRUE THEN FALSE ELSE sage_siege_responses.dm_reminded END,
        updated_at = NOW()`,
      [messageId, userId, characterName, className, guildName, nextRemind]
    );

    if (nextRemind) {
      let dmDelivered = false;
      try {
        await sendSageSiegeDmToUser(interaction.user, {
          siegeUnix: Number(eventRow.siege_unix),
          gatheringUnix: Number(eventRow.gathering_unix),
          isScheduledAlert: false,
        });
        dmDelivered = true;
      } catch (_) {}

      replyText = dmDelivered
        ? "🔔 **تم تفعيل زر التنبيه وأرسلت لك التفاصيل فوراً على الخاص (DM)!**\nسيصلك تذكير تلقائي آخر قبل السيج بساعتين ونصف (وقت التجمع)."
        : "🔔 **تم تفعيل التنبيه لك!** لكن الخاص (DMs) لديك مغلق حالياً؛ يرجى فتح الرسائل الخاصة من السيرفر لتستلم تنبيه التجمع قبل السيج بساعتين ونصف.";
    } else {
      replyText = "🔕 **تم إلغاء تفعيل تنبيه الخاص للسيج.** يمكنك الضغط على الزر مجدداً في أي وقت.";
    }
  }

  await refreshSageSiegeMessage(interaction.message, eventRow).catch((err) => {
    console.warn("[sageSiegeAlert] Failed to refresh sage siege embed:", err.message);
  });

  return interaction.editReply({ content: replyText });
}

export default {
  SAGE_GUILD_ID,
  SAGE_ORDERS_CHANNEL_ID,
  SAGE_VOICE_CHANNEL_ID,
  SAGE_REGISTRATION_CHANNEL_ID,
  SIEGE_BANNER_URL,
  initSageSiegeAlertDB,
  getSageSiegeSnapshot,
  buildSageSiegeComponents,
  fetchShugoTimers,
  getEuropeSiegeSchedule,
  buildSageSiegeAnnouncementEmbed,
  registerActiveSageSiege,
  checkSageSiegeReminders,
  publishSageSiegeAnnouncement,
  startDailySageSiegeCron,
  handleInteraction,
};
