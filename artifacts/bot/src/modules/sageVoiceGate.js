import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";

export const SAGE_GUILD_ID = "1507696012410749030";
export const ALLIANCE_MEMBER_ROLE_ID = "1571516616435302410";
export const UNIFIED_CHAT_ID = "1507706953521041509"; // 💬┊شات-التحالف
export const SERVER_OWNER_ID = "136371223209836544";

export const EXEMPT_ROLES = [
  "1507733275278577916", // 👑 ┃ Alliance Leader
  "1507733319989858435", // 📜 ┃ Alliance Council
  "1507733404781645874", // 🎙️ ┃ Shotcaller
  "1507733486671233175", // 🛡️ ┃ Guild Leader
];

// In-memory cache to ensure a member receives the DM only ONCE (cooldown 12 hours)
const dmSentCache = new Map();

/**
 * Checks whether a guild member is exempt from the voice gate (Leaders / Council / Shotcaller / Guild Leader / Owner).
 */
export function isMemberExempt(member) {
  if (!member) return false;
  if (member.id === SERVER_OWNER_ID) return true;
  if (member.guild?.ownerId === member.id) return true;
  return EXEMPT_ROLES.some((roleId) => member.roles.cache.has(roleId));
}

/**
 * Checks if the voice window is currently open for regular alliance members.
 * Window: 3 hours before Siege start, until 3 hours after Siege start.
 */
export async function isSiegeVoiceWindowOpen() {
  try {
    // 1. Check manual override in sage_siege_meta
    const overrideRes = await query("SELECT value FROM sage_siege_meta WHERE key = 'voice_window_override' LIMIT 1").catch(() => null);
    const override = overrideRes?.rows[0]?.value;
    if (override === "open") return { isOpen: true, reason: "manual_override" };
    if (override === "closed") return { isOpen: false, reason: "manual_override" };

    // 2. Dynamic check against sage_siege_events
    const nowUnix = Math.floor(Date.now() / 1000);
    // 3 hours = 10800 seconds
    const LEAD_SECONDS = 3 * 3600;
    const TAIL_SECONDS = 3 * 3600;

    const eventRes = await query(
      `SELECT * FROM sage_siege_events 
       WHERE siege_unix IS NOT NULL 
       ORDER BY siege_unix DESC LIMIT 5`
    ).catch(() => null);

    if (!eventRes || eventRes.rows.length === 0) {
      return { isOpen: false, reason: "no_events" };
    }

    for (const evt of eventRes.rows) {
      const sUnix = parseInt(evt.siege_unix, 10);
      const windowStart = sUnix - LEAD_SECONDS;
      const windowEnd = sUnix + TAIL_SECONDS;

      if (nowUnix >= windowStart && nowUnix <= windowEnd) {
        return {
          isOpen: true,
          event: evt,
          windowStart,
          windowEnd,
        };
      }
    }

    return { isOpen: false, reason: "outside_window" };
  } catch (err) {
    console.error("[sageVoiceGate] Error checking siege voice window:", err);
    return { isOpen: false, reason: "error" };
  }
}

/**
 * Handles voice state gate enforcement when a user joins or moves channels.
 */
export async function handleVoiceStateGate(oldState, newState) {
  if (newState.guild.id !== SAGE_GUILD_ID) return;

  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  // If leaving voice, do nothing
  if (!newState.channelId) return;

  // Leaders, Council, Shotcaller, Guild Leaders are completely exempt
  if (isMemberExempt(member)) {
    return;
  }

  // Regular members: check if siege voice window is open
  const windowStatus = await isSiegeVoiceWindowOpen();
  if (!windowStatus.isOpen) {
    console.log(`[sageVoiceGate] Disconnecting ${member.user.tag} (Voice closed outside siege window)`);
    await newState.disconnect().catch((err) => console.warn(`[sageVoiceGate] Failed to disconnect ${member.user.tag}:`, err.message));

    // Send DM once (12-hour cooldown per user)
    const now = Date.now();
    const lastSent = dmSentCache.get(member.id);
    if (!lastSent || now - lastSent > 12 * 3600 * 1000) {
      dmSentCache.set(member.id, now);
      const dmEmbed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setTitle("🛑 تنبيه خادم تحالف الحصارات | Siege Alliance")
        .setDescription(
          `مرحباً بك يا بطل **${member.user.username}**،\n\n` +
          `نود إحاطتك بأن القنوات الصوتية في خادم التحالف مخصصة **حصرياً لأوقات السيج والحروب الرسمية فقط**، حفاظاً على الجو العام والخصوصية والاستقلالية التنظيمية لكل قيلد.\n\n` +
          `⏰ **مواعيد الدخول واستخدام الرومات الصوتية:**\n` +
          `• يُتاح الدخول لجميع الأعضاء **قبل موعد السيج بـ 3 ساعات** (أو فور نشر إعلان السيج المعتمد).\n` +
          `• يتم إغلاق الرومات وفصل الاتصال تلقائياً **بعد مرور 3 ساعات من بدء السيج**.\n\n` +
          `👑 *التواجد في الرومات الصوتية خارج هذه الفترات مقتصر فقط على قادة التحالف والمستشارين والشوت كولر للتنسيق والتخطيط.*`
        )
        .setFooter({ text: "تحالف الحصارات • إدارة العمليات والتنظيم" })
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] }).catch(() => {
        console.warn(`[sageVoiceGate] Could not DM user ${member.id} (DMs closed)`);
      });
    }
  }
}

// In-memory flags to prevent duplicate automated warnings & clearing
const warned10mEvents = new Set();
const clearedEvents = new Set();

/**
 * Background watcher: sends 10-minute warning in chat, and disconnects all members at 3 hours post-siege.
 */
export async function runVoiceGateWatcher(client) {
  try {
    const guild = client.guilds.cache.get(SAGE_GUILD_ID);
    if (!guild) return;

    const nowUnix = Math.floor(Date.now() / 1000);
    const eventRes = await query(
      `SELECT * FROM sage_siege_events 
       WHERE siege_unix IS NOT NULL 
       ORDER BY siege_unix DESC LIMIT 5`
    ).catch(() => null);

    if (!eventRes || eventRes.rows.length === 0) return;

    for (const evt of eventRes.rows) {
      const sUnix = parseInt(evt.siege_unix, 10);
      const windowEnd = sUnix + 3 * 3600;
      const warningTime = windowEnd - 10 * 60; // 10 minutes before close

      // 1. Check 10-Minute Advance Warning
      if (nowUnix >= warningTime && nowUnix < windowEnd && !warned10mEvents.has(evt.message_id)) {
        warned10mEvents.add(evt.message_id);
        const chatCh = guild.channels.cache.get(UNIFIED_CHAT_ID) ?? await guild.channels.fetch(UNIFIED_CHAT_ID).catch(() => null);
        if (chatCh) {
          await chatCh.send({
            content: `📢 **تنبيه هام لجميع مقاتلي التحالف (<@&${ALLIANCE_MEMBER_ROLE_ID}>):**\n\n` +
              `نظراً لاختتام فعاليات حصار اليوم بنجاح، وتطبيقاً للائحة خادم التحالف (المخصص لتجمعات الحصارات فقط حفاظاً على الجو العام واستقرار التنظيم):\n\n` +
              `⚠️ **سيتم إغلاق القنوات الصوتية وفصل جميع الأعضاء بعد 10 دقائق.**\n\n` +
              `شكراً لجهودكم وتفاعلكم المشرف، ونراكم في الحصار القادم بإذن الله! ⚔️`,
          });
          console.log(`[sageVoiceGate] Sent 10-minute voice shutdown notice to #شات-التحالف`);
        }
      }

      // 2. Check 3-Hour Hard Closure & Disconnect
      if (nowUnix >= windowEnd && !clearedEvents.has(evt.message_id)) {
        clearedEvents.add(evt.message_id);
        console.log(`[sageVoiceGate] 3-Hour window elapsed for event ${evt.message_id}. Clearing voice channels...`);

        await guild.members.fetch().catch(() => {});
        const voiceChannels = guild.channels.cache.filter((c) => c.isVoiceBased());

        let disconnectedCount = 0;
        for (const [, vc] of voiceChannels) {
          for (const [, m] of vc.members) {
            if (!m.user.bot && !isMemberExempt(m)) {
              await m.voice.disconnect("انتهاء وقت السيج الرسمي").catch(() => {});
              disconnectedCount++;
            }
          }
        }

        console.log(`[sageVoiceGate] Successfully disconnected ${disconnectedCount} non-exempt member(s) from voice channels.`);
      }
    }
  } catch (err) {
    console.error("[sageVoiceGate] Error in voice gate watcher:", err);
  }
}
