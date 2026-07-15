import { broadcastPushNotification } from "../services/push.js";
import { EmbedBuilder } from "discord.js";

const THRESHOLDS = {
  shugo: { time: 240 },
  rift: { time: 300 },
  reset: { time: 3600 },
  maint: { time: 10800 },
  tl_dungeon: { time: 300 },
  tl_boss: { time: 300 },
  tl_whale: { time: 300 },
  tl_event: { time: 300 },
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
    case 'tl_dungeon': return { title: 'أحداث الدنجن (TL)', body: 'دنجنات مفتوحة بعد 5 دقائق! جهز البارتي' };
    case 'tl_boss': 
      const bossName = bossType === 'arc' ? 'زعيم الأرك' : 'زعيم العالم';
      const peaceText = isPeaceful ? '(نسخة سلمية 🕊️)' : '';
      return { title: `ظهور ${bossName} (TL) ${peaceText}`, body: `الزعيم بيظهر بعد 5 دقائق! اجتمعوا` };
    case 'tl_whale': return { title: 'الحوت Gigantrite (TL)', body: 'الحوت بيطير بعد 5 دقايق! لا يفوتك' };
    case 'tl_event': return { title: 'فعاليات العالم المفتوح Event', body: 'الفعاليات بتبدأ بعد 5 دقايق! الحق' };
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

  // ─── Throne and Liberty Timers (KSA Timezone GMT+3) ──────────────────────
  // Helper to get next KSA event regardless of server timezone
  const getNextKsaEvent = (hoursArray, min = 0) => {
    let nextEvent = null;
    for (let i = 0; i <= 2; i++) {
      for (let h of hoursArray) {
        let d = new Date(now.getTime());
        d.setUTCHours(h - 3, min, 0, 0);
        d.setUTCDate(d.getUTCDate() + i);
        if (d > now) {
          if (!nextEvent || d < nextEvent) nextEvent = d;
        }
      }
    }
    return nextEvent;
  };

  const getNextWeeklyKsaEvent = (dayOfWeek, hour, min = 0) => {
    let nextEvent = null;
    for (let i = 0; i <= 7; i++) {
      let d = new Date(now.getTime());
      d.setUTCHours(hour - 3, min, 0, 0);
      d.setUTCDate(d.getUTCDate() + i);
      let ksaDay = new Date(d.getTime() + 3 * 3600 * 1000).getUTCDay();
      if (ksaDay === dayOfWeek && d > now) {
        if (!nextEvent || d < nextEvent) nextEvent = d;
      }
    }
    return nextEvent;
  };

  // 5. TL Field Bosses (World Boss) at [0:00, 2:00, 14:00, 17:00, 20:00, 23:00] and 00:30
  let nextFieldBoss = getNextKsaEvent([0, 2, 14, 17, 20, 23]);
  let nextFieldBossHalf = getNextKsaEvent([0], 30);
  if (nextFieldBossHalf && nextFieldBossHalf < nextFieldBoss) {
    nextFieldBoss = nextFieldBossHalf;
  }

  // 5.5 TL Arc Boss (Wed, Sat at 20:00 and 23:00)
  let nextArcBoss = null;
  const arcBossSchedule = [
    { day: 3, hours: [20, 23] }, // Wednesday
    { day: 6, hours: [20, 23] }  // Saturday
  ];
  for (let sch of arcBossSchedule) {
    for (let h of sch.hours) {
      let d = getNextWeeklyKsaEvent(sch.day, h);
      if (d) {
        if (!nextArcBoss || d < nextArcBoss) nextArcBoss = d;
      }
    }
  }

  let nextOverallBoss = nextFieldBoss;
  let bossType = 'field';
  let isPeaceful = false;

  if (nextArcBoss && nextFieldBoss && nextArcBoss < nextFieldBoss) {
    nextOverallBoss = nextArcBoss;
    bossType = 'arc';
  } else if (!nextFieldBoss && nextArcBoss) {
    nextOverallBoss = nextArcBoss;
    bossType = 'arc';
  }

  // 6. TL Dynamic Events at [1, 4, 7, 10, 13, 16, 21, 22]
  let nextTlEvent = getNextKsaEvent([1, 4, 7, 10, 13, 16, 21, 22]);

  // 7. TL Dungeon Events (Removed from schedule, setting to far future)
  let nextTlDungeon = new Date(now.getTime() + 365 * 24 * 3600 * 1000);

  // 8. TL Whale (Gigantrite) at [0, 3, 6, 9, 12, 15, 18, 23]
  let nextTlWhale = getNextKsaEvent([0, 3, 6, 9, 12, 15, 18, 23]);

  // 9. TL Siege (Every Sunday at 21:00)
  let nextTlSiege = getNextWeeklyKsaEvent(0, 21) || new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  // 10. TL Tax Delivery (Bi-weekly on Sunday at 20:30)
  let nextTlTax = getNextWeeklyKsaEvent(0, 20, 30);
  if (nextTlTax) {
    const knownTaxDate = new Date(Date.UTC(2026, 6, 19, 17, 30, 0)); // July 19, 2026 20:30 KSA
    const diffWeeks = Math.round((nextTlTax.getTime() - knownTaxDate.getTime()) / (7 * 24 * 3600 * 1000));
    if (diffWeeks % 2 !== 0) {
      nextTlTax.setDate(nextTlTax.getDate() + 7);
    }
  } else {
    nextTlTax = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
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

export function setupGameTimers(client) {
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
          else prefKeys.push('notify_aion2');
          
          console.log(`[Timers] Triggering Push Notification for: ${key} with prefs:`, prefKeys);
          await broadcastPushNotification(title, body, { type: 'timer_event', eventKey: key }, prefKeys);

          // Discord Notification for Throne and Liberty
          if (client && key.startsWith('tl_')) {
            try {
              const channelId = "1526297989734334554";
              const roleId = "1292754458492796982";
              const channel = await client.channels.fetch(channelId).catch(() => null);
              if (channel) {
                let color = 0x2b2d31; // Default
                let thumbUrl = null;
                if (key === 'tl_boss') {
                  color = 0x9b59b6; // Purple
                  if (title && title.includes('الأرك')) {
                    thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526318552246784100/image.png?ex=6a56966c&is=6a5544ec&hm=4861276549d6169ee3b368afa7f3dd17aa46e648866e25c36a9d8c23cb751c30&";
                  } else {
                    thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526317944290807961/image.png?ex=6a5695db&is=6a55445b&hm=772a4676241a71552047c76d6f71f7c1193c3dd7cf0a78f41a9752838e0431a0&";
                  }
                } else if (key === 'tl_event') {
                  color = 0x2ecc71; // Green
                  thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526317907662078053/image.png?ex=6a5695d2&is=6a554452&hm=ed37726f3f21411b86488cf3377f08ff925e70fbe500e278321d064ee4b8b7f4&";
                } else if (key === 'tl_whale') {
                  color = 0xf1c40f; // Yellow
                  thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526318314253582366/image.png?ex=6a569633&is=6a5544b3&hm=6fcb662f1cc521c533ff3788037d76a373983f17836af08d3b10aed1877f68fe&";
                } else if (key === 'tl_siege' || key === 'tl_tax') {
                  color = 0xe67e22; // Orange
                  thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526318853913706718/image.png?ex=6a5696b4&is=6a554534&hm=985c6e18eed5ff4428697e42c50c5046802fa4b1804d17fbac84b2fa4176a1a2&";
                }

                const embed = new EmbedBuilder()
                  .setTitle(title)
                  .setDescription(`**${body}**\n\n🕒 **الوقت المتبقي:** أقل من ${Math.ceil(threshold / 60)} دقيقة`)
                  .setColor(color)
                  .setTimestamp();

                if (thumbUrl) embed.setThumbnail(thumbUrl);

                await channel.send({
                  content: `<@&${roleId}>`,
                  embeds: [embed]
                });
                console.log(`[Timers] Sent Discord embed for ${key} to channel ${channelId}`);
              }
            } catch (err) {
              console.error("[Timers] Failed to send Discord message:", err);
            }
          }
        }
      }
    }
  }, 10000); // Check every 10 seconds
}
