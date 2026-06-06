import { broadcastPushNotification } from "../services/push.js";

const THRESHOLDS = {
  shugo: { time: 240 },
  rift: { time: 300 },
  reset: { time: 3600 },
  maint: { time: 10800 },
  tl_dungeon: { time: 780 },
  tl_boss: { time: 960 },
  tl_whale: { time: 480 },
  tl_event: { time: 240 },
  tl_tax: { time: 2700 },
  tl_siege: { time: 5400 },
  gw2_teq: { time: 420 },
  gw2_karka: { time: 420 },
  gw2_triple: { time: 420 },
  gw2_anomaly: { time: 420 },
  gw2_chak: { time: 420 },
  gw2_octovine: { time: 420 }
};

const getNotificationDetails = (key, bossType, isPeaceful) => {
  switch (key) {
    case 'shugo': return { title: 'مهرجان الشوقو (Aion 2)', body: 'مهرجان الشوقو بيبدأ بعد 4 دقايق! جهز نفسك' };
    case 'rift': return { title: 'ظهور الصدوع (Aion 2)', body: 'الصدوع بتظهر بعد 5 دقايق! استعد للقتال' };
    case 'reset': return { title: 'الريست اليومي 🔄', body: 'باقي ساعة على الريست! الحق خلص مهامك' };
    case 'maint': return { title: 'الصيانة الأسبوعية ⚠️', body: 'باقي 3 ساعات على الصيانة! خلص محتواك بسرعة' };
    
    // Throne & Liberty
    case 'tl_dungeon': return { title: 'أحداث الدنجن (TL)', body: 'دنجنات مفتوحة بعد 13 دقيقة! جهز البارتي' };
    case 'tl_boss': 
      const bossName = bossType === 'arc' ? 'زعيم الأرك' : 'زعيم العالم';
      const peaceText = isPeaceful ? '(نسخة سلمية 🕊️)' : '';
      return { title: `ظهور ${bossName} (TL) ${peaceText}`, body: `الزعيم بيظهر بعد 16 دقيقة! اجتمعوا` };
    case 'tl_whale': return { title: 'الحوت Gigantrite (TL)', body: 'الحوت بيطير بعد 8 دقايق! لا يفوتك' };
    case 'tl_event': return { title: 'فعاليات العالم (TL)', body: 'الفعاليات بتبدأ بعد 4 دقايق! الحق' };
    case 'tl_tax': return { title: 'توصيل الضرائب (TL) 💰', body: 'التوصيل بيبدأ بعد 45 دقيقة! استعدوا' };
    case 'tl_siege': return { title: 'حصار القلعة (TL) 🏰', body: 'الحصار الكبير بيبدأ بعد ساعة ونص! منشن حلفائك واستعدوا للحرب' };

    // Guild Wars 2
    case 'gw2_teq': return { title: 'Tequatl (GW2)', body: 'الحدث بيبدأ بعد 7 دقائق!' };
    case 'gw2_karka': return { title: 'Karka Queen (GW2)', body: 'الحدث بيبدأ بعد 7 دقائق!' };
    case 'gw2_triple': return { title: 'Triple Trouble (GW2)', body: 'الحدث بيبدأ بعد 7 دقائق!' };
    case 'gw2_anomaly': return { title: 'Ley-Line Anomaly (GW2)', body: 'الحدث بيبدأ بعد 7 دقائق!' };
    case 'gw2_chak': return { title: 'Chak Gerent (GW2)', body: 'الحدث بيبدأ بعد 7 دقائق!' };
    case 'gw2_octovine': return { title: 'Octovine (GW2)', body: 'الحدث بيبدأ بعد 7 دقائق!' };

    default: return { title: 'تذكير بحدث', body: 'حدث قادم قريباً' };
  }
};

function calculateTimers() {
  const now = new Date();
  
  // 1. Rift: Every 3 hours (0, 3, 6, 9, 12, 15, 18, 21)
  const sched = [0, 3, 6, 9, 12, 15, 18, 21];
  let nextRift = null;
  for (let h of sched) {
    let r = new Date(now);
    r.setHours(h, 0, 0, 0);
    let end = new Date(r);
    end.setMinutes(10);
    if (now >= r && now < end) { nextRift = end; break; }
    if (r > now) { nextRift = r; break; }
  }
  if (!nextRift) {
    nextRift = new Date(now);
    nextRift.setDate(nextRift.getDate() + 1);
    nextRift.setHours(0, 0, 0, 0);
  }

  // 2. Weekly Maintenance: Tuesday at 22:30
  let nextMaint = new Date(now);
  let daysUntil = (2 - now.getDay() + 7) % 7;
  nextMaint.setDate(now.getDate() + daysUntil);
  nextMaint.setHours(22, 30, 0, 0);
  if (now > nextMaint) nextMaint.setDate(nextMaint.getDate() + 7);

  // 3. Daily Reset (Midnight)
  let nextReset = new Date(now);
  nextReset.setHours(0, 0, 0, 0);
  if (now >= nextReset) nextReset.setDate(nextReset.getDate() + 1);

  // 4. Shugo Festival (assuming every 2 hours)
  let nextShugo = new Date(now);
  let currentHour = now.getHours();
  nextShugo.setHours(currentHour + (currentHour % 2 === 0 ? 2 : 1), 0, 0, 0);

  // 5. TL Field Bosses (World Boss) at [1, 4, 15, 18, 22]
  let nextFieldBoss = new Date(now);
  const tlBossHours = [1, 4, 15, 18, 22];
  let foundFieldBoss = false;
  for (let h of tlBossHours) {
    let possibleTime = new Date(now);
    possibleTime.setHours(h, 0, 0, 0);
    if (possibleTime > now) {
      nextFieldBoss = possibleTime;
      foundFieldBoss = true;
      break;
    }
  }
  if (!foundFieldBoss) {
    nextFieldBoss.setDate(nextFieldBoss.getDate() + 1);
    nextFieldBoss.setHours(tlBossHours[0], 0, 0, 0);
  }

  // 5.5 TL Arc Boss (Tue, Wed, Fri, Sat at 20:00 and 23:00)
  let nextArcBoss = new Date(now);
  const arcBossSchedule = [
    { day: 2, hours: [20, 23] },
    { day: 3, hours: [20, 23] },
    { day: 5, hours: [20, 23] },
    { day: 6, hours: [20, 23] },
  ];
  let foundArcBoss = false;
  for (let i = 0; i < 7; i++) {
    let checkDate = new Date(now);
    checkDate.setDate(now.getDate() + i);
    let dayOfWeek = checkDate.getDay();
    let daySchedule = arcBossSchedule.find(s => s.day === dayOfWeek);
    if (daySchedule) {
      for (let h of daySchedule.hours) {
        let possibleTime = new Date(checkDate);
        possibleTime.setHours(h, 0, 0, 0);
        if (possibleTime > now) {
          nextArcBoss = possibleTime;
          foundArcBoss = true;
          break;
        }
      }
    }
    if (foundArcBoss) break;
  }

  let nextOverallBoss = nextFieldBoss;
  let bossType = 'field';
  let isPeaceful = false;

  if (nextArcBoss < nextFieldBoss) {
    nextOverallBoss = nextArcBoss;
    bossType = 'arc';
    let bossDay = nextArcBoss.getDay();
    if (bossDay === 2 || bossDay === 6) {
      isPeaceful = true;
    }
  }

  // 6. TL Dynamic Events at [1, 4, 7, 10, 13, 16, 20, 23]
  let nextTlEvent = new Date(now);
  const tlEventHours = [1, 4, 7, 10, 13, 16, 20, 23];
  let foundEvent = false;
  for (let h of tlEventHours) {
    let possibleTime = new Date(now);
    possibleTime.setHours(h, 0, 0, 0);
    if (possibleTime > now) {
      nextTlEvent = possibleTime;
      foundEvent = true;
      break;
    }
  }
  if (!foundEvent) {
    nextTlEvent.setDate(nextTlEvent.getDate() + 1);
    nextTlEvent.setHours(tlEventHours[0], 0, 0, 0);
  }

  // 7. TL Dungeon Events at [19, 22]
  let nextTlDungeon = new Date(now);
  const tlDungeonHours = [19, 22];
  let foundDungeon = false;
  for (let h of tlDungeonHours) {
    let possibleTime = new Date(now);
    possibleTime.setHours(h, 0, 0, 0);
    if (possibleTime > now) {
      nextTlDungeon = possibleTime;
      foundDungeon = true;
      break;
    }
  }
  if (!foundDungeon) {
    nextTlDungeon.setDate(nextTlDungeon.getDate() + 1);
    nextTlDungeon.setHours(tlDungeonHours[0], 0, 0, 0);
  }

  // 8. TL Whale (Gigantrite) at [0, 3, 6, 9, 12, 15, 18, 21]
  let nextTlWhale = new Date(now);
  const tlWhaleHours = [0, 3, 6, 9, 12, 15, 18, 21];
  let foundWhale = false;
  for (let h of tlWhaleHours) {
    let possibleTime = new Date(now);
    possibleTime.setHours(h, 0, 0, 0);
    if (possibleTime > now) {
      nextTlWhale = possibleTime;
      foundWhale = true;
      break;
    }
  }
  if (!foundWhale) {
    nextTlWhale.setDate(nextTlWhale.getDate() + 1);
    nextTlWhale.setHours(tlWhaleHours[0], 0, 0, 0);
  }

  // 9. TL Siege (Every Sunday at 21:00)
  let nextTlSiege = new Date(now);
  let daysUntilSun = (0 - now.getDay() + 7) % 7;
  nextTlSiege.setDate(now.getDate() + daysUntilSun);
  nextTlSiege.setHours(21, 0, 0, 0);
  if (now >= nextTlSiege) {
    nextTlSiege.setDate(nextTlSiege.getDate() + 7);
  }

  // 10. TL Tax Delivery
  let nextTlTax = new Date(now);
  let daysUntilSat = (6 - now.getDay() + 7) % 7;
  nextTlTax.setDate(now.getDate() + daysUntilSat);
  nextTlTax.setHours(22, 0, 0, 0);
  if (nextTlTax < now) {
    nextTlTax.setDate(nextTlTax.getDate() + 7);
  }

  // 11. GW2 Timers (UTC)
  const calcGw2Timer = (hours, min) => {
    let nextTime = new Date(now);
    let found = false;
    for (let h of hours) {
      let possible = new Date(now);
      possible.setUTCHours(h, min, 0, 0);
      if (possible > now) {
        nextTime = possible;
        found = true;
        break;
      }
    }
    if (!found) {
      nextTime.setUTCDate(nextTime.getUTCDate() + 1);
      nextTime.setUTCHours(hours[0], min, 0, 0);
    }
    return Math.max(0, Math.floor((nextTime.getTime() - now.getTime()) / 1000));
  };

  return {
    rift: Math.max(0, Math.floor((nextRift.getTime() - now.getTime()) / 1000)),
    shugo: Math.max(0, Math.floor((nextShugo.getTime() - now.getTime()) / 1000)),
    maint: Math.max(0, Math.floor((nextMaint.getTime() - now.getTime()) / 1000)),
    reset: Math.max(0, Math.floor((nextReset.getTime() - now.getTime()) / 1000)),
    tl_boss: Math.max(0, Math.floor((nextOverallBoss.getTime() - now.getTime()) / 1000)),
    tl_boss_type: bossType,
    tl_boss_peaceful: isPeaceful,
    tl_event: Math.max(0, Math.floor((nextTlEvent.getTime() - now.getTime()) / 1000)),
    tl_dungeon: Math.max(0, Math.floor((nextTlDungeon.getTime() - now.getTime()) / 1000)),
    tl_whale: Math.max(0, Math.floor((nextTlWhale.getTime() - now.getTime()) / 1000)),
    tl_siege: Math.max(0, Math.floor((nextTlSiege.getTime() - now.getTime()) / 1000)),
    tl_tax: Math.max(0, Math.floor((nextTlTax.getTime() - now.getTime()) / 1000)),
    gw2_teq: calcGw2Timer([0, 4, 8, 12, 16, 20], 0),
    gw2_karka: calcGw2Timer([2, 6, 10, 14, 18, 22], 0),
    gw2_triple: calcGw2Timer([1, 5, 9, 13, 17, 21], 0),
    gw2_anomaly: calcGw2Timer([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22], 20),
    gw2_chak: calcGw2Timer([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23], 30),
    gw2_octovine: calcGw2Timer([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22], 45)
  };
}

// Keep track of recently triggered events so we don't spam
const triggeredEvents = {};

export function setupGameTimers() {
  console.log("[Timers] Global game timers started.");
  
  setInterval(async () => {
    const timers = calculateTimers();
    const nowMs = Date.now();
    
    // Clean up old triggered events
    Object.keys(triggeredEvents).forEach(key => {
      if (nowMs - triggeredEvents[key] > 2 * 60 * 1000) {
        delete triggeredEvents[key];
      }
    });

    for (const key of Object.keys(THRESHOLDS)) {
      const threshold = THRESHOLDS[key].time;
      const timeLeft = timers[key];
      
      // If we are exactly at the threshold (or within 5 seconds to account for slight delays)
      if (timeLeft <= threshold && timeLeft > threshold - 15) {
        if (!triggeredEvents[key]) {
          triggeredEvents[key] = nowMs;
          const { title, body } = getNotificationDetails(key, timers.tl_boss_type, timers.tl_boss_peaceful);
          
          let prefKeys = [];
          if (key.startsWith('tl_')) prefKeys.push('notify_tl');
          else if (key.startsWith('gw2_')) prefKeys.push('notify_gw2');
          else prefKeys.push('notify_aion');

          if (key === 'rift') prefKeys.push('notify_rifts');
          else if (key === 'tl_siege') prefKeys.push('notify_siege');
          else prefKeys.push('notify_events');
          
          console.log(`[Timers] Triggering Push Notification for: ${key} with prefs:`, prefKeys);
          await broadcastPushNotification(title, body, { type: 'timer_event', eventKey: key }, prefKeys);
        }
      }
    }
  }, 10000); // Check every 10 seconds
}
