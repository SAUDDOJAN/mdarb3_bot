import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";

const DESTINATION_CHANNELS = [
  "1551268446875029704"
];
const AION2_MEMBER_ROLE_ID = "1401376073077231702";

const TARGETS = {
  "Cleric": 23,
  "Templar": 16,
  "Chanter": 16,
  "Gladiator": 18,
  "Sorcerer": 16,
  "Ranger": 16,
  "Assassin": 15,
  "Spiritmaster": 8
};

const ALL_CLASSES = [
  "Gladiator", "Templar", 
  "Ranger", "Assassin", 
  "Sorcerer", "Spiritmaster", "Chanter", "Cleric"
];

export async function initAnnouncerDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_announcement_events (
      app_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (app_id, event_type)
    )
  `);

  try {
    // Preserve old singleton history safely so they never replay
    await query(`INSERT INTO aion2_announcement_events (app_id, event_type, created_at) SELECT app_id, event_type, announced_at FROM aion2_roster_announcements ON CONFLICT DO NOTHING`);
  } catch (e) {
    // Ignore if old table doesn't exist
  }

  await query(`
    CREATE TABLE IF NOT EXISTS aion2_announcement_deliveries (
      id SERIAL PRIMARY KEY,
      app_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      discord_message_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      processing_started_at TIMESTAMPTZ,
      UNIQUE(app_id, event_type, channel_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS aion2_periodic_reports (
      id SERIAL PRIMARY KEY,
      scheduled_for TIMESTAMPTZ NOT NULL,
      status TEXT DEFAULT 'PENDING',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      processing_started_at TIMESTAMPTZ
    )
  `);

  const safeAlter = async (q) => { try { await query(q); } catch(e) {} };
  await safeAlter(`ALTER TABLE aion2_announcement_deliveries ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ`);
  await safeAlter(`ALTER TABLE aion2_periodic_reports ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ`);
  await safeAlter(`ALTER TABLE aion2_periodic_reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING'`);
  await safeAlter(`ALTER TABLE aion2_periodic_reports ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ DEFAULT NOW()`);
  await safeAlter(`ALTER TABLE aion2_periodic_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);

  // Seed the first report cycle if empty
  const checkReports = await query(`SELECT 1 FROM aion2_periodic_reports`);
  if (checkReports.rowCount === 0) {
    await query(`INSERT INTO aion2_periodic_reports (scheduled_for) VALUES (NOW())`);
  }
}

export async function getLiveStats(tableName = 'aion2_global_applications') {
  const globalRes = await query(`
    SELECT selected_class, reviewed_at, id 
    FROM ${tableName} 
    WHERE status = 'ACCEPTED' 
      AND guild_type = 'GLOBAL' 
      AND transition_status IS NULL 
    ORDER BY selected_class ASC, reviewed_at ASC, id ASC
  `);

  const globalCounts = {};
  const globalMainCounts = {};
  const globalReserveCounts = {};
  for (const cls of Object.keys(TARGETS)) {
    globalCounts[cls] = 0;
    globalMainCounts[cls] = 0;
    globalReserveCounts[cls] = 0;
  }

  for (const row of globalRes.rows) {
    const cls = row.selected_class;
    if (globalCounts[cls] === undefined) {
      globalCounts[cls] = 0;
      globalMainCounts[cls] = 0;
      globalReserveCounts[cls] = 0;
    }
    globalCounts[cls]++;
    const target = TARGETS[cls] || 0;
    if (globalCounts[cls] <= target) {
      globalMainCounts[cls]++;
    } else {
      globalReserveCounts[cls]++;
    }
  }

  let globalMain = 0;
  let globalReserve = 0;
  let globalTotal = 0;
  for (const cls of Object.keys(TARGETS)) {
    globalMain += globalMainCounts[cls] || 0;
    globalReserve += globalReserveCounts[cls] || 0;
    globalTotal += globalCounts[cls] || 0;
  }
  const globalRemainingMain = Math.max(0, 128 - globalMain);

  const earlyRes = await query(`
    SELECT COUNT(*) as count 
    FROM ${tableName} 
    WHERE status = 'ACCEPTED' 
      AND guild_type = 'EARLY_ACCESS'
  `);
  const earlyTotal = parseInt(earlyRes.rows[0].count, 10);
  const earlyRemaining = Math.max(0, 128 - earlyTotal);

  return {
    globalTotal,
    globalMain,
    globalReserve,
    globalRemainingMain,
    globalCounts,
    globalMainCounts,
    globalReserveCounts,
    earlyTotal,
    earlyRemaining
  };
}

export function buildClassDistributionText(stats) {
  const { globalMainCounts, globalReserveCounts } = stats;
  let text = "";
  for (const [cls, target] of Object.entries(TARGETS)) {
    const main = globalMainCounts[cls] || 0;
    const reserve = globalReserveCounts[cls] || 0;
    const remaining = Math.max(0, target - main);

    text += `${cls}: ${main} / ${target} — متبقي ${remaining} — احتياط ${reserve}\n`;
  }
  return text.trimEnd();
}

export function buildGlobalSection(stats) {
  const { globalMain, globalReserve, globalTotal, globalRemainingMain } = stats;
  let header = `إجمالي الأساسيين: ${globalMain} من 128\n🟡 الاحتياط: ${globalReserve}`;
  if (globalReserve > 0 && globalTotal !== globalMain) {
    header += `\nإجمالي أعضاء القلوبال: ${globalTotal}`;
  }
  header += `\nالمقاعد الأساسية المتبقية: ${globalRemainingMain}`;

  return `🌍 **Global**\n\n${header}\n\n${buildClassDistributionText(stats)}`;
}

export function buildEarlySection(stats) {
  const { earlyTotal, earlyRemaining } = stats;
  return `⚡ **Early Access**\n\nإجمالي الأعضاء: ${earlyTotal} من 128\nالمقاعد المتبقية: ${earlyRemaining}`;
}

export async function triggerAcceptanceAnnouncement(client, appId) {
  const insertEvent = await query(`INSERT INTO aion2_announcement_events (app_id, event_type) VALUES ($1, 'GLOBAL_ACCEPT') ON CONFLICT DO NOTHING RETURNING 1`, [appId]);
  if (insertEvent.rowCount === 0) return;

  for (const channelId of DESTINATION_CHANNELS) {
    await query(`INSERT INTO aion2_announcement_deliveries (app_id, event_type, channel_id) VALUES ($1, 'GLOBAL_ACCEPT', $2) ON CONFLICT DO NOTHING`, [appId, channelId]);
  }
  await processDeliveries(client);
}

export async function triggerMigrationAnnouncement(client, appId) {
  const insertEvent = await query(`INSERT INTO aion2_announcement_events (app_id, event_type) VALUES ($1, 'EARLY_MIGRATION') ON CONFLICT DO NOTHING RETURNING 1`, [appId]);
  if (insertEvent.rowCount === 0) return;

  for (const channelId of DESTINATION_CHANNELS) {
    await query(`INSERT INTO aion2_announcement_deliveries (app_id, event_type, channel_id) VALUES ($1, 'EARLY_MIGRATION', $2) ON CONFLICT DO NOTHING`, [appId, channelId]);
  }
  await processDeliveries(client);
}

export async function triggerDirectEarlyAnnouncement(client, appId) {
  const insertEvent = await query(`INSERT INTO aion2_announcement_events (app_id, event_type) VALUES ($1, 'DIRECT_EARLY_JOIN') ON CONFLICT DO NOTHING RETURNING 1`, [appId]);
  if (insertEvent.rowCount === 0) return;

  for (const channelId of DESTINATION_CHANNELS) {
    await query(`INSERT INTO aion2_announcement_deliveries (app_id, event_type, channel_id) VALUES ($1, 'DIRECT_EARLY_JOIN', $2) ON CONFLICT DO NOTHING`, [appId, channelId]);
  }
  await processDeliveries(client);
}

export async function triggerRemovalAnnouncement(client, appId) {
  const insertEvent = await query(`INSERT INTO aion2_announcement_events (app_id, event_type) VALUES ($1, 'MEMBER_REMOVAL') ON CONFLICT DO NOTHING RETURNING 1`, [appId]);
  if (insertEvent.rowCount === 0) return;

  for (const channelId of DESTINATION_CHANNELS) {
    await query(`INSERT INTO aion2_announcement_deliveries (app_id, event_type, channel_id) VALUES ($1, 'MEMBER_REMOVAL', $2) ON CONFLICT DO NOTHING`, [appId, channelId]);
  }
  await processDeliveries(client);
}

export async function generateEmbedForDelivery(app_id, event_type, stats) {
  if (event_type === 'PERIODIC_REPORT') {
    return new EmbedBuilder()
      .setColor("#3498DB")
      .setTitle("📊 تقرير إحصائيات AION 2")
      .setDescription(`${buildGlobalSection(stats)}\n\n${buildEarlySection(stats)}`);
  }

  const appRes = await query(`SELECT selected_class, guild_type FROM aion2_global_applications WHERE id = $1`, [app_id]);
  const cls = appRes.rows[0]?.selected_class || "Unknown";
  const guildType = appRes.rows[0]?.guild_type || "GLOBAL";
  const selectedClass = cls;

  if (event_type === 'MEMBER_REMOVAL') {
    return new EmbedBuilder()
      .setColor("#E74C3C")
      .setTitle("🚪 عضو غادر الروستر")
      .setDescription(`تم إزالة عضو من **${guildType === 'EARLY_ACCESS' ? 'Early Access' : 'Global'}**\nالكلاس: **${cls}**\n\n${buildGlobalSection(stats)}\n\n${buildEarlySection(stats)}`);
  }

  if (event_type === 'GLOBAL_ACCEPT') {
    return new EmbedBuilder()
      .setColor("#00FF00")
      .setDescription(`✅ **عضو جديد انضم إلى Global**\n\n**الكلاس الذي تم قبوله:**\n${selectedClass}\n\n${buildGlobalSection(stats)}\n\n${buildEarlySection(stats)}`);
  }

  if (event_type === 'DIRECT_EARLY_JOIN') {
    return new EmbedBuilder()
      .setColor("#FFD700")
      .setDescription(`⚡ **انضمام مباشر إلى Early Access**\n\n**تم تسجيل عضو جديد مباشرة في Early Access بدون فئة محددة.**\n\n${buildGlobalSection(stats)}\n\n${buildEarlySection(stats)}`);
  }

  if (event_type === 'EARLY_MIGRATION') {
    return new EmbedBuilder()
      .setColor("#FFA500")
      .setDescription(`⚡ **عضو انتقل من Global إلى Early Access**\n\n**الكلاس المنتقل إلى Early Access:**\n${selectedClass}\n\n**المقعد الذي أصبح شاغرًا في Global:**\n${selectedClass}\n\n${buildGlobalSection(stats)}\n\n${buildEarlySection(stats)}`);
  }

  return null;
}

async function processDeliveries(client) {
  const pending = await query(`
    UPDATE aion2_announcement_deliveries
    SET status = 'PROCESSING', processing_started_at = NOW()
    WHERE id IN (
      SELECT id FROM aion2_announcement_deliveries 
      WHERE status = 'PENDING' 
         OR (status = 'PROCESSING' AND processing_started_at < NOW() - INTERVAL '5 minutes')
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  
  if (pending.rowCount === 0) return;

  const stats = await getLiveStats();

  for (const delivery of pending.rows) {
    const { id, app_id, event_type, channel_id, attempts } = delivery;
    
    const embed = await generateEmbedForDelivery(app_id, event_type, stats);
    if (!embed) continue;

    const channel = client.channels.cache.get(channel_id) || await client.channels.fetch(channel_id).catch(() => null);
    if (!channel) {
      await query(`UPDATE aion2_announcement_deliveries SET status = 'PENDING', attempts = attempts + 1, last_error = 'Channel not found' WHERE id = $1`, [id]);
      continue;
    }

    try {
      const msg = await channel.send({ content: `<@&${AION2_MEMBER_ROLE_ID}>`, embeds: [embed], allowedMentions: { roles: [AION2_MEMBER_ROLE_ID] } });
      
      // ONLY MARK SENT IF DISCORD API SUCCESS
      await query(`UPDATE aion2_announcement_deliveries SET status = 'SENT', sent_at = NOW(), discord_message_id = $1 WHERE id = $2`, [msg.id, id]);
    } catch (err) {
      console.error(`[Announcer] Failed to send to ${channel_id}:`, err);
      await query(`UPDATE aion2_announcement_deliveries SET status = 'PENDING', attempts = attempts + 1, last_error = $1 WHERE id = $2`, [err.message, id]);
    }
  }

  // Check if any periodic reports are fully completed
  const pendingReports = await query(`SELECT id FROM aion2_periodic_reports WHERE status = 'PENDING'`);
  for (const report of pendingReports.rows) {
    const delivs = await query(`SELECT status FROM aion2_announcement_deliveries WHERE app_id = $1 AND event_type = 'PERIODIC_REPORT'`, [report.id]);
    
    const allSent = delivs.rowCount === DESTINATION_CHANNELS.length && delivs.rows.every(r => r.status === 'SENT');
    if (allSent) {
      await query(`UPDATE aion2_periodic_reports SET status = 'COMPLETED' WHERE id = $1`, [report.id]);
      // Schedule the next one exactly 3 days from the current one's scheduled_for to avoid drift
      await query(`INSERT INTO aion2_periodic_reports (scheduled_for) VALUES ((SELECT scheduled_for + INTERVAL '3 days' FROM aion2_periodic_reports WHERE id = $1))`, [report.id]);
    }
  }
}

export async function runPeriodicScheduler(client) {
  // Try to claim any due pending reports atomically
  const dueReport = await query(`
    UPDATE aion2_periodic_reports
    SET status = 'PROCESSING', processing_started_at = NOW()
    WHERE id = (
      SELECT id FROM aion2_periodic_reports 
      WHERE (status = 'PENDING' AND NOW() >= scheduled_for)
         OR (status = 'PROCESSING' AND processing_started_at < NOW() - INTERVAL '10 minutes')
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);

  if (dueReport.rowCount > 0) {
    const reportId = dueReport.rows[0].id;
    // Log deliveries safely
    for (const channelId of DESTINATION_CHANNELS) {
      await query(`INSERT INTO aion2_announcement_deliveries (app_id, event_type, channel_id) VALUES ($1, 'PERIODIC_REPORT', $2) ON CONFLICT DO NOTHING`, [reportId, channelId]);
    }
  }
  
  await processDeliveries(client);
}

export function startPeriodicAnnouncer(client) {
  // First run on boot to catch up any missed deliveries or reports
  runPeriodicScheduler(client);
  
  // Background worker runs every 5 minutes
  setInterval(() => {
    runPeriodicScheduler(client);
  }, 1000 * 60 * 5);
}


