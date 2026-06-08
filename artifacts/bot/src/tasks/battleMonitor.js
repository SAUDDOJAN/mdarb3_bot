import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";
import { addPoints } from "../modules/management.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const BATTLE_VOICE_ID     = "1504419701642760292"; // قناة الصوت "المعارك"
const LOBBY_CHANNEL_ID    = "1496783538937135184"; // ساحة المجموعات — مكان إمبد الحدث
const INTERACT_LOG_ID     = "1470406771318460426"; // الاعلانات
const WITHDRAWAL_LOG_ID   = "1502976886710730823"; // سجل الانسحابات
const MAIN_GUILD_ID       = process.env.MAIN_GUILD_ID || "861355983975874601";

const MONITOR_INTERVAL    = 12 * 60 * 1000; // 12 دقيقة لكل check
const MAX_DURATION        = 65 * 60 * 1000; // 65 دقيقة حد أقصى
const REQUIRED_CHECKS     = 5;              // 5 checks × 12 دقيقة = 60 دقيقة
const POINTS_PER_CHECK    = 10;             // 5 × 10 = 50 نقطة مجموع

let activeBattle = null;

// ─── Arabic Time of Day ───────────────────────────────────────────────────────
function getArabicTimeOfDay(date) {
  // KSA = UTC+3
  const ksaHour = (date.getUTCHours() + 3) % 24;
  if (ksaHour >= 5  && ksaHour < 12) return "الصباح ☀️";
  if (ksaHour >= 12 && ksaHour < 13) return "الظهر 🌤️";
  if (ksaHour >= 13 && ksaHour < 16) return "العصر 🌥️";
  if (ksaHour >= 16 && ksaHour < 19) return "المغرب 🌆";
  if (ksaHour >= 19 && ksaHour < 22) return "العشاء 🌙";
  if (ksaHour >= 22 || ksaHour < 2)  return "منتصف الليل 🌃";
  return "آخر الليل 🌌";
}

// ─── Start Battle Monitor ─────────────────────────────────────────────────────
export async function startBattleMonitor(client, eventId, eventMsgId) {
  if (activeBattle) {
    console.log("[BattleMonitor] A battle event is already active.");
    return;
  }

  const guild = client.guilds.cache.get(MAIN_GUILD_ID)
    ?? await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);
  if (!guild) return console.error("[BattleMonitor] M3RGEEN guild not found.");

  const voiceChannel = guild.channels.cache.get(BATTLE_VOICE_ID)
    ?? await guild.channels.fetch(BATTLE_VOICE_ID).catch(() => null);
  if (!voiceChannel) return console.error("[BattleMonitor] Battle voice channel not found.");

  await guild.members.fetch();

  // Snapshot who's currently in the VC
  const initialVcMembers = new Set(voiceChannel.members.keys());
  const initialCount = initialVcMembers.size;
  console.log(`[BattleMonitor] Started! Event #${eventId}. Initial VC count: ${initialCount}`);

  // Build attendance map for ALL guild members (to track absent ones)
  const attendanceMap = new Map();
  for (const [memberId, member] of guild.members.cache) {
    if (member.user.bot) continue;
    attendanceMap.set(memberId, {
      displayName: member.displayName || member.user.username,
      checks: 0,
      pointsAwarded: 0,
      everJoined: initialVcMembers.has(memberId),
      withdrawnAnnounced: false
    });
  }

  activeBattle = {
    guild,
    eventId,
    eventMsgId,
    attendanceMap,
    startTime: Date.now(),
    intervalId: setInterval(() => runBattleCheck(client, guild, voiceChannel), MONITOR_INTERVAL)
  };
}

// ─── Periodic Check ───────────────────────────────────────────────────────────
async function runBattleCheck(client, guild, voiceChannel) {
  if (!activeBattle) return;
  const { attendanceMap, startTime } = activeBattle;
  const now = Date.now();
  const elapsed = now - startTime;

  await guild.members.fetch();
  const currentVcMembers = new Set(voiceChannel.members.keys());

  // Auto-end after max duration
  if (elapsed >= MAX_DURATION) {
    return await endBattle(client, guild);
  }

  for (const [userId, record] of attendanceMap.entries()) {
    const inVc = currentVcMembers.has(userId);

    if (inVc) {
      record.everJoined = true;
      if (record.checks < REQUIRED_CHECKS) {
        record.checks += 1;
        try {
          await addPoints(client, MAIN_GUILD_ID, userId, POINTS_PER_CHECK);
          record.pointsAwarded += POINTS_PER_CHECK;
        } catch (e) {
          console.error(`[BattleMonitor] Failed to add pts for ${userId}:`, e);
        }
      }
    } else {
      // Withdrawn: was in VC but left before completing
      if (record.everJoined && record.checks < REQUIRED_CHECKS && !record.withdrawnAnnounced && elapsed >= 15 * 60 * 1000) {
        record.withdrawnAnnounced = true;
        record.status = "withdrawn";
        await logBattleWithdrawal(client, guild, userId, record).catch(console.error);
      }
    }
  }
}

// ─── Log Withdrawal ───────────────────────────────────────────────────────────
async function logBattleWithdrawal(client, guild, userId, record) {
  const withdrawalCh = guild.channels.cache.get(WITHDRAWAL_LOG_ID)
    ?? await guild.channels.fetch(WITHDRAWAL_LOG_ID).catch(() => null);
  if (!withdrawalCh) return;

  const now = new Date();
  const timeOfDay = getArabicTimeOfDay(now);
  const durationMin = record.checks * 12; // approximate minutes stayed

  // Get total withdrawals from DB
  const wRes = await query(
    "SELECT withdrawals FROM points WHERE guild_id=$1 AND user_id=$2",
    [MAIN_GUILD_ID, userId]
  );
  const totalWithdrawals = (wRes.rows[0]?.withdrawals ?? 0) + 1;
  await query(
    `INSERT INTO points (guild_id, user_id, withdrawals)
     VALUES ($1,$2,1)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET withdrawals = points.withdrawals + 1`,
    [MAIN_GUILD_ID, userId]
  ).catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("⚠️ انسحاب مبكر — فعالية المعارك")
    .setDescription(`غادر العضو <@${userId}> قناة المعارك الصوتية قبل اكتمال الفعالية.`)
    .addFields(
      { name: "👤 العضو",             value: `<@${userId}> (${record.displayName})`, inline: true  },
      { name: "⏱️ مدة البقاء",         value: `~${durationMin} دقيقة`,               inline: true  },
      { name: "⏰ وقت الانسحاب",       value: timeOfDay,                              inline: true  },
      { name: "🏅 النقاط المكتسبة",    value: `${record.pointsAwarded}pt`,            inline: true  },
      { name: "📊 إجمالي الانسحابات",  value: `${totalWithdrawals} انسحاب`,           inline: true  },
    )
    .setTimestamp();

  await withdrawalCh.send({ embeds: [embed] });
}

// ─── End Battle ───────────────────────────────────────────────────────────────
export async function endBattle(client, guild) {
  if (!activeBattle) return;
  clearInterval(activeBattle.intervalId);
  const { attendanceMap, eventId, eventMsgId } = activeBattle;
  activeBattle = null;
  console.log("[BattleMonitor] Ended. Generating report...");

  const guildObj = guild ?? client.guilds.cache.get(MAIN_GUILD_ID);
  if (!guildObj) return;

  // ─── Build Member Stats ──────────────────────────────────────────────────
  const memberStats = [];
  for (const [userId, record] of attendanceMap.entries()) {
    const status = !record.everJoined
      ? "absent"
      : record.checks >= REQUIRED_CHECKS
        ? "present"
        : "withdrawn";
    memberStats.push({ id: userId, displayName: record.displayName, points: record.pointsAwarded, status });
  }

  // Only include members who did something (present/withdrawn) + absent if they were expected
  // For battle, include everyone
  memberStats.sort((a, b) => {
    const order = { present: 0, withdrawn: 1, absent: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.points - a.points;
  });

  const presentCount   = memberStats.filter(m => m.status === "present").length;
  const withdrawnCount = memberStats.filter(m => m.status === "withdrawn").length;
  const absentCount    = memberStats.filter(m => m.status === "absent").length;
  const totalPoints    = memberStats.reduce((sum, m) => sum + m.points, 0);

  let statsText = "";
  for (const m of memberStats) {
    if (m.status === "absent") continue; // Only show active participants in stats
    const icon = m.status === "present" ? "✅" : "⚠️";
    statsText += `${icon} <@${m.id}> \`${m.points}pt\`\n`;
  }

  if (!statsText) statsText = "لم يشارك أي عضو في هذه الفعالية.";

  // ─── Update Event Embed in ساحة المجموعات ────────────────────────────────
  if (eventMsgId) {
    const lobbyCh = guildObj.channels.cache.get(LOBBY_CHANNEL_ID)
      ?? await guildObj.channels.fetch(LOBBY_CHANNEL_ID).catch(() => null);
    if (lobbyCh) {
      const eventMsg = await lobbyCh.messages.fetch(eventMsgId).catch(() => null);
      if (eventMsg && eventMsg.embeds[0]) {
        const updatedEmbed = EmbedBuilder.from(eventMsg.embeds[0])
          .setColor(0x2b2d31)
          .addFields(
            { name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", value: "​", inline: false },
            {
              name: "📊 إحصائية المعارك — النتائج النهائية",
              value: `✅ حضور كامل: **${presentCount}** | ⚠️ انسحاب مبكر: **${withdrawnCount}** | ❌ غياب: **${absentCount}**\n🏅 إجمالي النقاط الممنوحة: **${totalPoints}pt**`,
              inline: false,
            },
            { name: "👥 تفاصيل المشاركين:", value: statsText, inline: false }
          );
        await eventMsg.edit({ embeds: [updatedEmbed], components: [] }).catch(err =>
          console.error("[BattleMonitor] Failed to update event embed:", err.message)
        );
      }
    }
  }

  // ─── Send Stats to سجل التفاعل ─────────────────────────────────────────
  const interactLog = guildObj.channels.cache.get(INTERACT_LOG_ID)
    ?? await guildObj.channels.fetch(INTERACT_LOG_ID).catch(() => null);
  if (interactLog) {
    const reportEmbed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle("🏟️ نتائج فعالية المعارك الداخلية")
      .setDescription(
        `✅ حضور كامل: **${presentCount}** | ⚠️ انسحاب مبكر: **${withdrawnCount}** | ❌ غياب: **${absentCount}**\n` +
        `🏅 إجمالي النقاط الممنوحة: **${totalPoints}pt**\n\n` +
        `${statsText}`
      )
      .setFooter({ text: "M3RGEEN Events System" })
      .setTimestamp();
    await interactLog.send({ embeds: [reportEmbed] });
  }

  // ─── Store in DB for weekly report ────────────────────────────────────────
  for (const m of memberStats) {
    if (m.points > 0) {
      await query(
        `INSERT INTO battle_results (guild_id, user_id, event_id, points_awarded, status, event_date)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT DO NOTHING`,
        [MAIN_GUILD_ID, m.id, eventId, m.points, m.status]
      ).catch(() => {});
    }
  }

  console.log(`[BattleMonitor] ✅ Report sent. ${presentCount} present, ${withdrawnCount} withdrawn, ${absentCount} absent.`);
}
