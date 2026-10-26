// Utility for deterministic Asia/Riyadh time cycle boundaries.
// Riyadh is permanently UTC+3. No DST.
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export function getRiyadhDate(date = new Date()) {
  return new Date(date.getTime() + RIYADH_OFFSET_MS);
}

export function fromRiyadhDate(riyadhDate) {
  return new Date(riyadhDate.getTime() - RIYADH_OFFSET_MS);
}

/**
 * Returns the start of the current Abyss daily cycle in UTC.
 * Boundary: 05:00 AM Asia/Riyadh every day.
 */
export function getCurrentDailyCycleStart(now = new Date()) {
  const r = getRiyadhDate(now);
  const cycleStart = new Date(r);
  cycleStart.setUTCHours(5, 0, 0, 0); // 05:00 Riyadh time

  if (r.getUTCHours() < 5) {
    // Before 5 AM Riyadh, so the cycle started yesterday at 5 AM.
    cycleStart.setUTCDate(cycleStart.getUTCDate() - 1);
  }
  return fromRiyadhDate(cycleStart);
}

/**
 * Returns the start of the current Weekly cycle in UTC.
 * Boundary: Wednesday 05:00 AM Asia/Riyadh.
 */
export function getCurrentWeeklyCycleStart(now = new Date()) {
  const r = getRiyadhDate(now);
  const cycleStart = new Date(r);
  cycleStart.setUTCHours(5, 0, 0, 0);

  // JavaScript getUTCDay(): 0 is Sunday, 3 is Wednesday
  const currentDay = r.getUTCDay();
  const currentHour = r.getUTCHours();
  
  // Calculate days since last Wednesday 05:00
  let daysToSubtract = currentDay - 3;
  if (daysToSubtract < 0) {
    daysToSubtract += 7; // It's before Wed in the week (e.g. Mon, Tue)
  }
  
  if (daysToSubtract === 0 && currentHour < 5) {
    // It's Wednesday, but before 05:00 AM. Belongs to previous week.
    daysToSubtract = 7;
  }
  
  cycleStart.setUTCDate(cycleStart.getUTCDate() - daysToSubtract);
  return fromRiyadhDate(cycleStart);
}

/**
 * Returns the start of the current Monthly cycle in UTC, and the Cycle ID.
 * Boundary: Day 5 at 00:00:00 Asia/Riyadh.
 * Cycle ID format: YYYY-MM based on the month the cycle started.
 */
export function getCurrentMonthlyCycle(now = new Date()) {
  const r = getRiyadhDate(now);
  let year = r.getUTCFullYear();
  let month = r.getUTCMonth(); // 0-11
  let date = r.getUTCDate();
  
  if (date < 5) {
    // Before the 5th, belongs to the previous month's cycle
    month = month - 1;
    if (month < 0) {
      month = 11;
      year = year - 1;
    }
  }
  
  const cycleStart = new Date(Date.UTC(year, month, 5, 0, 0, 0, 0));
  
  const cycleId = year + "-" + (month + 1).toString().padStart(2, '0');
  
  return {
    cycleId,
    cycleStartUTC: fromRiyadhDate(cycleStart)
  };
}
