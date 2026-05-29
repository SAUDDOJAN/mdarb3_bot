import { fireAlert } from "../modules/alerts.js";
import { query } from "../database/index.js";
import { startSiegeMonitor } from "./siegeMonitor.js";
import { sendWeeklyReport } from "./weeklyReport.js";

const KSA_OFFSET_HOURS = 3;

function nowKSA() {
  const now = new Date();
  return new Date(now.getTime() + KSA_OFFSET_HOURS * 60 * 60 * 1000);
}

const fired = new Set();

function firedKey(type, ksaDate) {
  const d = ksaDate;
  return `${type}-${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${d.getUTCMinutes()}`;
}

function tryFire(type, ksaDate) {
  const key = firedKey(type, ksaDate);
  if (fired.has(key)) return false;
  fired.add(key);
  if (fired.size > 2000) {
    const oldest = [...fired].slice(0, 500);
    oldest.forEach((k) => fired.delete(k));
  }
  return true;
}

async function getAllAlertGuilds() {
  const res = await query(
    "SELECT guild_id FROM guild_config WHERE alert_channel_id IS NOT NULL"
  );
  return res.rows.map((r) => r.guild_id);
}

async function tick(client) {
  const ksa = nowKSA();
  const h = ksa.getUTCHours();
  const m = ksa.getUTCMinutes();
  const day = ksa.getUTCDay();

  let toFire = [];

  if (m === 30) {
    if ((day === 3 || day === 6) && h === 16) {
      toFire.push("siege_alert");
    }
  }

  if (m === 55) {
    toFire.push("shugo_prep");
    if ((day === 3 || day === 6) && h === 16) {
      toFire.push("siege_prep");
    }
  }

  if (m === 0) {
    toFire.push("shugo");

    if (h % 3 === 0) {
      toFire.push("rift");
    }

    if (h === 0) {
      toFire.push("daily");
    }

    if ((day === 3 || day === 6) && h === 17) {
      toFire.push("siege");
    }

    // Weekly report — Sunday 9PM KSA (day=0)
    if (day === 0 && h === 21) {
      toFire.push("weekly_report");
    }
  }

  if (toFire.length === 0) return;

  const guilds = await getAllAlertGuilds();
  if (guilds.length === 0) return;

  for (const alertType of toFire) {
    if (!tryFire(alertType, ksa)) continue;
    console.log(`[Radar] Triggering "${alertType}" — KSA ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    for (const guildId of guilds) {
      await fireAlert(client, guildId, alertType);
    }
    
    // Auto-start siege monitor at exactly 5:00 PM on the Sage Guild
    if (alertType === "siege") {
      const sageGuildId = process.env.SAGE_GUILD_ID || "1507696012410749030";
      startSiegeMonitor(client, sageGuildId).catch(err => console.error("[SiegeMonitor] Error starting:", err));
    }

    // Weekly report — Every Sunday at 9PM KSA (day=0, h=21, m=0)
    if (alertType === "weekly_report") {
      sendWeeklyReport(client).catch(err => console.error("[WeeklyReport] Error:", err));
    }
  }
}

export function startRadar(client) {
  console.log("[Radar] Starting event radar (KSA timezone, UTC+3)...");

  const msUntilNextMinute = () => {
    const now = Date.now();
    return 60_000 - (now % 60_000) + 500;
  };

  const schedule = () => {
    setTimeout(async () => {
      await tick(client).catch((err) =>
        console.error("[Radar] Tick error:", err)
      );
      schedule();
    }, msUntilNextMinute());
  };

  schedule();
  console.log("[Radar] Radar armed. Next tick in", Math.round(msUntilNextMinute() / 1000), "seconds.");
}
