import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getAllTlSchedules } from "../../database/index.js";

export const data = new SlashCommandBuilder()
  .setName("tl_events")
  .setDescription("عرض جدول الأحداث القادمة للعبة Throne and Liberty (بأوقاتك المحلية)");

export async function execute(interaction) {
  await interaction.deferReply();
  const now = new Date();
  
  let schedules = [];
  try {
    schedules = await getAllTlSchedules();
  } catch (err) {
    console.error("[TL Events] Error fetching TL schedules:", err);
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

  // Helper to get upcoming times from fixed/DB schedules within 24h
  const getUpcomingKsaEventsDb = (type, defaultHours) => {
    let upcoming = [];
    const maxFutureMs = 24 * 3600 * 1000;
    
    for (let i = 0; i <= 2; i++) {
      let dTest = new Date(now.getTime());
      dTest.setUTCDate(dTest.getUTCDate() + i);
      let ksaDay = new Date(dTest.getTime() + 3 * 3600 * 1000).getUTCDay();
      
      let dbSched = getDbScheduleForDay(ksaDay);
      let hours = dbSched ? dbSched[type] : defaultHours;

      for (let h of hours) {
        let d = new Date(dTest.getTime());
        d.setUTCHours(h - 3, 0, 0, 0); // KSA to UTC
        if (d > now && (d.getTime() - now.getTime()) <= maxFutureMs) {
          upcoming.push(d);
        }
      }
    }
    return upcoming.sort((a, b) => a - b).slice(0, 3);
  };

  let defaultBoss = [0, 2, 14, 17, 20, 23];
  let defaultEvent = [1, 4, 7, 10, 13, 16, 21];
  let defaultWhale = [0, 3, 6, 9, 12, 15, 18, 23];

  let upcomingBosses = getUpcomingKsaEventsDb('field_boss', defaultBoss);
  let upcomingEvents = getUpcomingKsaEventsDb('event', defaultEvent);
  let upcomingWhales = getUpcomingKsaEventsDb('whale', defaultWhale);

  // Gate of Memory upcoming
  const anchorTimeTlGate = new Date('2026-07-27T15:05:08Z').getTime();
  const cycleTlGateMs = (3 * 3600 + 16 * 60 + 46) * 1000;
  
  let upcomingGates = [];
  for(let i=0; i<4; i++) {
    const nextTlGate = new Date(anchorTimeTlGate + (Math.floor((now.getTime() - anchorTimeTlGate) / cycleTlGateMs) + 1 + i) * cycleTlGateMs);
    upcomingGates.push(nextTlGate);
  }

  const formatTimes = (dates) => {
    if (dates.length === 0) return "لا توجد أحداث قريبة";
    return dates.map(d => `<t:${Math.floor(d.getTime() / 1000)}:t> (<t:${Math.floor(d.getTime() / 1000)}:R>)`).join('\n');
  };

  const embed = new EmbedBuilder()
    .setTitle("📅 جدول أحداث Throne and Liberty القادمة")
    .setDescription("يتم عرض الأوقات تلقائياً **بتوقيتك المحلي** بناءً على إعدادات جهازك!")
    .setColor("#3498db")
    .addFields(
      { name: "👹 الزعماء (Field Bosses)", value: formatTimes(upcomingBosses) || "-", inline: false },
      { name: "⚔️ الفعاليات (Dynamic Events)", value: formatTimes(upcomingEvents) || "-", inline: false },
      { name: "🐋 الحوت (Gigantrite)", value: formatTimes(upcomingWhales) || "-", inline: false },
      { name: "🌀 بوابة الذكريات (Gate of Memory)", value: formatTimes(upcomingGates) || "-", inline: false }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
