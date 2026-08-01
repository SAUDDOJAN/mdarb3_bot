import { broadcastPushNotification } from "../services/push.js";
import { publishOverlayEvent, getAllTlSchedules, query } from "../database/index.js";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const THRESHOLDS = {
  shugo: { time: 240 },
  rift: { time: 300 },
  reset: { time: 3600 },
  maint: { time: 10800 },
  tl_dungeon: { time: 300 },
  tl_boss: { time: 300 },
  tl_whale: { time: 300 },
  tl_event: { time: 300 },
  tl_gate: { time: 300 },
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
      let bossName = 'زعيم العالم';
      if (bossType === 'arc') bossName = 'زعيم الأرك';
      else if (bossType === 'both') bossName = 'زعماء العالم والآرك';
      const peaceText = isPeaceful ? '(نسخة سلمية 🕊️)' : '';
      return { title: `ظهور ${bossName} (TL) ${peaceText}`, body: `الزعماء بيظهرون بعد 5 دقائق! اجتمعوا` };
    case 'tl_whale': return { title: 'الحوت Gigantrite (TL)', body: 'الحوت بيطير بعد 5 دقايق! لا يفوتك' };
    case 'tl_event': return { title: 'فعاليات العالم المفتوح Event', body: 'الفعاليات بتبدأ بعد 5 دقايق! الحق' };
    case 'tl_gate': return { title: 'بوابة الذكريات (Gate of Memory) ⏳', body: 'بوابة الذكريات تفتح بعد 5 دقائق! استعد' };
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

async function calculateTimers() {
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

  // Fetch schedules from DB
  let schedules = [];
  try {
    schedules = await getAllTlSchedules();
  } catch (err) {
    console.error("[Timers] Error fetching TL schedules:", err);
  }

  const getDbScheduleForDay = (dayIndex) => {
    const s = schedules.find(x => x.day_of_week === dayIndex);
    if (!s) return null;
    return {
      field_boss: s.field_boss_hours ? s.field_boss_hours.split(',').map(Number) : [],
      arc_boss: s.arc_boss_hours ? s.arc_boss_hours.split(',').map(Number) : [],
      event: s.event_hours ? s.event_hours.split(',').map(Number) : [],
      whale: s.whale_hours ? s.whale_hours.split(',').map(Number) : []
    };
  };

  // Helper to get next KSA event regardless of server timezone using DB schedules
  const getNextKsaEventDb = (type, defaultHours) => {
    let nextEvent = null;
    for (let i = 0; i <= 2; i++) {
      let dTest = new Date(now.getTime());
      dTest.setUTCDate(dTest.getUTCDate() + i);
      let ksaDay = new Date(dTest.getTime() + 3 * 3600 * 1000).getUTCDay();
      
      let dbSched = getDbScheduleForDay(ksaDay);
      let hours = dbSched ? dbSched[type] : defaultHours;

      for (let h of hours) {
        let d = new Date(dTest.getTime());
        d.setUTCHours(h - 3, 0, 0, 0); // Convert KSA hour to UTC hour
        if (d > now) {
          if (!nextEvent || d < nextEvent) nextEvent = d;
        }
      }
    }
    return nextEvent;
  };

  // Default fallback schedules if DB is empty
  let defaultBoss = [0, 2, 14, 17, 20, 23];
  let defaultEvent = [1, 4, 7, 10, 13, 16, 21];
  let defaultWhale = [0, 3, 6, 9, 12, 15, 18, 23];

  let nextFieldBoss = getNextKsaEventDb('field_boss', defaultBoss);
  let nextFieldBossHalf = getNextKsaEvent([0], 30); // Keep 00:30 half-hour boss fixed for now
  if (nextFieldBossHalf && (!nextFieldBoss || nextFieldBossHalf < nextFieldBoss)) {
    nextFieldBoss = nextFieldBossHalf;
  }

  // 5.5 TL Arc Boss
  let nextArcBoss = getNextKsaEventDb('arc_boss', []); // empty array default so it doesn't default to field boss hours
  if (!nextArcBoss) {
    const arcBossSchedule = [
      { day: 3, hours: [20, 23] }, // Wednesday
      { day: 5, hours: [20, 23] }, // Friday (Based on new game schedule)
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
  }

  let nextOverallBoss = nextFieldBoss;
  let bossType = 'field';
  let isPeaceful = false;

  if (nextArcBoss && nextFieldBoss && nextArcBoss.getTime() === nextFieldBoss.getTime()) {
    nextOverallBoss = nextArcBoss;
    bossType = 'arc';
  } else if (nextArcBoss && nextFieldBoss && nextArcBoss < nextFieldBoss) {
    nextOverallBoss = nextArcBoss;
    bossType = 'arc';
  } else if (!nextFieldBoss && nextArcBoss) {
    nextOverallBoss = nextArcBoss;
    bossType = 'arc';
  }

  // 6. TL Dynamic Events
  let nextTlEvent = getNextKsaEventDb('event', defaultEvent);

  // 7. TL Dungeon Events (Removed from schedule, setting to far future)
  let nextTlDungeon = new Date(now.getTime() + 365 * 24 * 3600 * 1000);

  // 8. TL Whale (Gigantrite)
  let nextTlWhale = getNextKsaEventDb('whale', defaultWhale);

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

  // 11. TL Gate of Memory
  // Mathematical Rule: every 3h 16m 46s, duration 4 mins.
  // Updated Anchor based on metaforge (after server maintenance shift)
  const anchorTimeTlGate = new Date('2026-07-27T15:05:08Z').getTime();
  const cycleTlGateMs = (3 * 3600 + 16 * 60 + 46) * 1000;
  const nextTlGate = new Date(anchorTimeTlGate + (Math.floor((now.getTime() - anchorTimeTlGate) / cycleTlGateMs) + 1) * cycleTlGateMs);

  // 12. GW2 Timers (UTC)
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
    tl_gate: Math.max(0, Math.floor((nextTlGate.getTime() - now.getTime()) / 1000)),
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
    const timers = await calculateTimers();
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
              
              let color = 0x2b2d31; // Default
              let thumbUrl = null;
              if (key === 'tl_boss') {
                color = 0x9b59b6; // Purple
                if (title && (title.includes('الأرك') || title.includes('الآرك'))) {
                  thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526923128633032724/archboss.png?ex=6a58c97a&is=6a5777fa&hm=2e632e58f16aa1fa9e163ad81a5f1b323b8fef2add2b6454cadda2a3f588b6d0&";
                } else {
                  thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526922983220969502/boss.png?ex=6a58c958&is=6a5777d8&hm=41cd4728c14eaba52543ebe8da794ce564d2326acff6472a4ea72b7eae388f3e&";
                }
              } else if (key === 'tl_event') {
                color = 0x2ecc71; // Green
                thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526922801620193401/dynamic.png?ex=6a58c92c&is=6a5777ac&hm=3477a829e91733cc82d8e2cfc99197bdb9f899d6538c67c6f629f207fee2dfa1&";
              } else if (key === 'tl_whale') {
                color = 0xf1c40f; // Yellow
                thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526922077624336496/whale.png?ex=6a58c880&is=6a577700&hm=ed416a40f7c8e794debe6b3cfdb5c3e61270cb26876364197cf3d8b24ed0b0e2&";
              } else if (key === 'tl_tax') {
                color = 0xe67e22; // Orange
                thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526922320461959319/tax.png?ex=6a58c8ba&is=6a57773a&hm=2b27bac4eaf986c90045c08feec631423b7e8b3a91f2977599fbc2b697b2c84e&";
              } else if (key === 'tl_siege') {
                color = 0xe67e22; // Orange
                thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526922446295269506/siege.png?ex=6a58c8d8&is=6a577758&hm=a32091f1c1ce0ff79a9b0221c12db39608ac7eb03ea79508c54cb51502130a82&";
              } else if (key === 'tl_gate') {
                color = 0x3498db; // Blue
                thumbUrl = "https://cdn.discordapp.com/attachments/1290449971639881849/1526941223900942386/Gate_of_Memory.png?ex=6a58da54&is=6a5788d4&hm=965af4cd324233af92be0b5a1ee8c1ce82a7a391ef53a1d5c5b0d30563001696&";
              }

              const channel = await client.channels.fetch(channelId).catch(() => null);
              if (channel) {

                const embed = new EmbedBuilder()
                  .setTitle(title)
                  .setDescription(`**${body}**\n\n🕒 **الوقت المتبقي:** أقل من ${Math.ceil(threshold / 60)} دقيقة`)
                  .setColor(color)
                  .setTimestamp();

                if (thumbUrl) embed.setThumbnail(thumbUrl);

                // Build Subscription Button
                const subscribeButton = new ButtonBuilder()
                  .setCustomId(`alerts:subscribe:${key}`)
                  .setLabel(`🔔 تفعيل/إلغاء التنبيه`)
                  .setStyle(ButtonStyle.Secondary);
                
                const actionRow = new ActionRowBuilder().addComponents(subscribeButton);

                // Fetch subscribers from DB
                let mentionsStr = "";
                let guildId = channel.guild?.id || channel.guildId;
                if (guildId) {
                  try {
                    const subscribers = await query(
                      "SELECT user_id FROM alert_subscriptions WHERE guild_id=$1 AND alert_type=$2",
                      [guildId, key]
                    );
                    if (subscribers.rows.length > 0) {
                      mentionsStr = subscribers.rows.map(r => `<@${r.user_id}>`).join(" ");
                    }
                  } catch (e) {
                    console.error("[Timers] Failed to fetch subscribers for", key, e);
                  }
                }

                const msgPayload = {
                  embeds: [embed],
                  components: [actionRow]
                };
                if (mentionsStr) {
                  msgPayload.content = mentionsStr;
                }

                await channel.send(msgPayload);
                console.log(`[Timers] Sent Discord embed for ${key} to channel ${channelId} with ${mentionsStr ? mentionsStr.split(" ").length : 0} mentions.`);
              }
              // Map eventType for Overlay App
              let overlayEventType = key;
              if (key === 'tl_boss') {
                overlayEventType = (title && (title.includes('الأرك') || title.includes('الآرك'))) ? "Arch Boss" : "Field Boss";
              } else if (key === 'tl_event') {
                overlayEventType = "Dynamic Event";
              } else if (key === 'tl_whale') {
                overlayEventType = "Gigantrite";
              } else if (key === 'tl_tax') {
                overlayEventType = "Tax Delivery";
              } else if (key === 'tl_siege') {
                overlayEventType = "Castle Siege";
              } else if (key === 'tl_gate') {
                overlayEventType = "Gate of Memory";
              }

              // Publish to Windows Desktop Overlay App
              await publishOverlayEvent(
                overlayEventType, // eventType mapped to AI's requested names
                title, // eventName
                thumbUrl, // imageUrl
                Math.ceil(threshold / 60) // timerMinutes
              );

            } catch (err) {
              console.error("[Timers] Failed to send Discord message:", err);
            }
          }
        }
      }
    }
  }, 10000); // Check every 10 seconds
}

export function startUnifiedRaidsCron(client) {
  setInterval(async () => {
    try {
      const res = await query(`
        SELECT * FROM tl_raids_events 
        WHERE alert_now_sent = false
      `);

      for (const event of res.rows) {
        const raidTime = new Date(event.raid_time);
        const now = new Date();
        const diffMs = raidTime.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        const channel = await client.channels.fetch(event.channel_id).catch(() => null);
        if (!channel) continue;
        const guild = channel.guild;
        const role = guild.roles.cache.find(r => r.name.toLowerCase() === 'tl guild');
        
        let dmMessage = null;

        // Alert 1: 3 days before (72 hours)
        if (diffHours <= 72 && diffHours > 24 && !event.alert_3d_sent) {
          dmMessage = `🔔 **تنبيه مسبق (باقي 3 أيام)!**\nريد **${event.title}** سيكون بتاريخ: <t:${Math.floor(raidTime.getTime()/1000)}:F>\n\nسجل حضورك الآن في روم التنبيهات!`;
          await query(`UPDATE tl_raids_events SET alert_3d_sent = true WHERE id = $1`, [event.id]);
        }
        
        // Alert 2: 24 hours before (Start of the last 24h as user requested)
        if (diffHours <= 24 && diffHours > 0 && !event.alert_24h_sent) {
          dmMessage = `🔔 **تنبيه (باقي 24 ساعة)!**\nريد **${event.title}** سيكون غداً: <t:${Math.floor(raidTime.getTime()/1000)}:F>\n\nلا تنسى تسجيل حضورك!`;
          await query(`UPDATE tl_raids_events SET alert_24h_sent = true WHERE id = $1`, [event.id]);
        }

        // Send the DM to all role members if there's a DM queued
        if (dmMessage && role) {
          await guild.members.fetch();
          for (const [id, member] of role.members) {
            if (!member.user.bot) {
              await member.send({ content: dmMessage }).catch(() => {});
            }
          }
        }

        // Alert 3: 5 minutes before (General chat)
        if (diffMs <= 5 * 60 * 1000 && diffMs > 0 && !event.alert_5m_sent) {
          await query(`UPDATE tl_raids_events SET alert_5m_sent = true WHERE id = $1`, [event.id]);
          const generalChannelId = "1294312574162178200";
          const generalChannel = await client.channels.fetch(generalChannelId).catch(() => null);
          if (generalChannel) {
            const roleId = "1292754458492796982";
            const msg = await generalChannel.send(`يا شباب إحنا بدينا نلعب ريد **${event.title}** الآن وحنكري أعضاء الجيلد اللي حاب يخلص الريد يدخل الروم الصوتي\n<@&${roleId}>`);
            // Delete after 5 minutes
            setTimeout(() => {
              msg.delete().catch(() => {});
            }, 5 * 60 * 1000);
          }
        }

        // Alert 4: At exact time (Close registration & final DM)
        if (diffMs <= 0 && !event.alert_now_sent) {
          await query(`UPDATE tl_raids_events SET alert_now_sent = true WHERE id = $1`, [event.id]);
          
          if (role) {
            await guild.members.fetch();
            for (const [id, member] of role.members) {
              if (!member.user.bot) {
                await member.send({ content: `⚔️ **بدأ الريد الآن!**\nريد **${event.title}** بدأ الآن. توجه للروم الصوتي فوراً!` }).catch(() => {});
              }
            }
          }

          // Close the message
          const msg = await channel.messages.fetch(event.message_id).catch(() => null);
          if (msg && msg.embeds.length > 0) {
            const { EmbedBuilder } = await import("discord.js");
            const embed = EmbedBuilder.from(msg.embeds[0]);
            embed.setColor("#7f8c8d");
            if (!embed.data.title?.includes("(مغلق)")) embed.setTitle((embed.data.title || "") + " (مغلق)");
            // Remove buttons
            await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error("[Timers] Error in unified raids cron:", e);
    }
  }, 60000); // Check every minute
}
