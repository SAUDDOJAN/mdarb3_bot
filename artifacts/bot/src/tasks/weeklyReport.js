import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";

const MAIN_GUILD_ID    = process.env.MAIN_GUILD_ID || "861355983975874601";
const INTERACT_LOG_ID  = "1470406771318460426"; // الاعلانات (Announcements)

// ─── Arabic Time of Day ───────────────────────────────────────────────────────
function getKSADate() {
  const now = new Date();
  return new Date(now.getTime() + 3 * 60 * 60 * 1000); // UTC+3
}

function getWeekBounds() {
  const ksa = getKSADate();
  // Go back to last Saturday 00:00 KSA
  const day = ksa.getUTCDay(); // 0=Sun 6=Sat
  const daysSinceSat = (day + 1) % 7; // days since last Saturday
  const start = new Date(ksa);
  start.setUTCDate(ksa.getUTCDate() - daysSinceSat);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCHours(start.getUTCHours() - 3); // convert back to UTC

  const end = new Date(); // Now
  return { start, end };
}

// ─── Build Weekly Report ──────────────────────────────────────────────────────
export async function sendWeeklyReport(client) {
  console.log("[WeeklyReport] Generating weekly report...");

  const guild = client.guilds.cache.get(MAIN_GUILD_ID)
    ?? await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);
  if (!guild) return console.error("[WeeklyReport] M3RGEEN guild not found.");

  const interactLog = guild.channels.cache.get(INTERACT_LOG_ID)
    ?? await guild.channels.fetch(INTERACT_LOG_ID).catch(() => null);
  if (!interactLog) return console.error("[WeeklyReport] Interaction log channel not found.");

  const { start, end } = getWeekBounds();
  const startStr = start.toISOString();
  const endStr   = end.toISOString();

  await guild.members.fetch();

  // ─── 1. Siege Points This Week ───────────────────────────────────────────
  const siegeRes = await query(
    `SELECT sr.user_id, COALESCE(SUM(sr.points_awarded),0) as siege_pts
     FROM siege_results sr
     WHERE sr.guild_id=$1 AND sr.event_date >= $2 AND sr.event_date <= $3
     GROUP BY sr.user_id`,
    [MAIN_GUILD_ID, startStr, endStr]
  ).catch(() => ({ rows: [] }));
  const siegeMap = new Map(siegeRes.rows.map(r => [r.user_id, parseInt(r.siege_pts)]));

  // ─── 2. Battle Points This Week ──────────────────────────────────────────
  const battleRes = await query(
    `SELECT br.user_id, COALESCE(SUM(br.points_awarded),0) as battle_pts
     FROM battle_results br
     WHERE br.guild_id=$1 AND br.event_date >= $2 AND br.event_date <= $3
     GROUP BY br.user_id`,
    [MAIN_GUILD_ID, startStr, endStr]
  ).catch(() => ({ rows: [] }));
  const battleMap = new Map(battleRes.rows.map(r => [r.user_id, parseInt(r.battle_pts)]));

  // ─── 3. Dungeon Points This Week ─────────────────────────────────────────
  const dungeonRes = await query(
    `SELECT dp.user_id, 
            COUNT(*) as dungeon_count,
            COALESCE(SUM(dp.points_awarded),0) as dungeon_pts
     FROM dungeon_participations dp
     WHERE dp.guild_id=$1 AND dp.participated_at >= $2 AND dp.participated_at <= $3
     GROUP BY dp.user_id`,
    [MAIN_GUILD_ID, startStr, endStr]
  ).catch(() => ({ rows: [] }));
  const dungeonMap = new Map(dungeonRes.rows.map(r => [
    r.user_id,
    { count: parseInt(r.dungeon_count), pts: parseInt(r.dungeon_pts) }
  ]));

  // ─── 4. Collect all unique participants ──────────────────────────────────
  const allUsers = new Set([
    ...siegeMap.keys(),
    ...battleMap.keys(),
    ...dungeonMap.keys()
  ]);

  if (allUsers.size === 0) {
    await interactLog.send({
      embeds: [new EmbedBuilder()
        .setColor(0x7289da)
        .setTitle("📊 التقرير الأسبوعي — لا توجد نقاط")
        .setDescription("لم يتم تسجيل أي نقاط هذا الأسبوع.")
        .setTimestamp()]
    });
    return;
  }

  // Build player rows
  const playerRows = [];
  for (const userId of allUsers) {
    const siegePts   = siegeMap.get(userId)  ?? 0;
    const battlePts  = battleMap.get(userId) ?? 0;
    const dungeonInfo = dungeonMap.get(userId) ?? { count: 0, pts: 0 };
    const totalPts = siegePts + battlePts + dungeonInfo.pts;

    const member = guild.members.cache.get(userId);
    const displayName = member ? (member.displayName || member.user.username) : `<@${userId}>`;

    playerRows.push({ userId, displayName, siegePts, battlePts, dungeonInfo, totalPts });
  }

  // Sort by total points desc
  playerRows.sort((a, b) => b.totalPts - a.totalPts);

  // ─── Build Report Text ────────────────────────────────────────────────────
  let reportText = "";
  let rank = 1;
  for (const p of playerRows) {
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `**${rank}.**`;
    const dungeonText = p.dungeonInfo.count > 0
      ? `💎 دنجن: \`${p.dungeonInfo.pts}pt\` (${p.dungeonInfo.count} دنجن)`
      : `💎 دنجن: \`0pt\``;

    reportText +=
      `${medal} <@${p.userId}>\n` +
      `⚔️ سيج: \`${p.siegePts}pt\` | 🏟️ معارك: \`${p.battlePts}pt\` | ${dungeonText}\n` +
      `🏅 **المجموع: ${p.totalPts}pt**\n\n`;

    rank++;
    if (reportText.length > 3800) {
      reportText += "*(باقي اللاعبين في الرسالة التالية)*";
      break;
    }
  }

  const ksa = getKSADate();
  const weekLabel = `${start.toLocaleDateString("ar-SA")} — ${ksa.toLocaleDateString("ar-SA")}`;

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`🏆 التقرير الأسبوعي للنقاط — ${weekLabel}`)
    .setDescription(reportText)
    .addFields(
      {
        name: "📌 تفاصيل",
        value:
          `👥 عدد المشاركين: **${allUsers.size}**\n` +
          `⚔️ إجمالي نقاط السيج: **${[...siegeMap.values()].reduce((a,b)=>a+b,0)}pt**\n` +
          `🏟️ إجمالي نقاط المعارك: **${[...battleMap.values()].reduce((a,b)=>a+b,0)}pt**\n` +
          `💎 إجمالي نقاط الدنجن: **${[...dungeonMap.values()].reduce((a,b)=>a+b.pts,0)}pt**`,
        inline: false
      }
    )
    .setFooter({ text: "M3RGEEN Events System • تقرير أسبوعي تلقائي" })
    .setTimestamp();

  await interactLog.send({ content: "📊 **التقرير الأسبوعي الشامل للنقاط:**", embeds: [embed] });
  console.log("[WeeklyReport] ✅ Weekly report sent successfully.");
}

export function startWeeklyReportTask(client) {
  console.log("[WeeklyReport] Weekly report scheduler initialized.");
  // Actual scheduling is done via radar.js on Sunday 9PM KSA
}
