/**
 * WAT = West Africa Time = UTC+1 (Lagos, Nigeria)
 * Daily rewards reset at midnight WAT (00:00 WAT = 23:00 UTC previous day).
 */

const WAT_OFFSET_MS = 60 * 60 * 1000; // UTC+1

/** Returns a YYYY-MM-DD date string in WAT timezone */
export function getWATDateString(date: Date): string {
  const watDate = new Date(date.getTime() + WAT_OFFSET_MS);
  const y = watDate.getUTCFullYear();
  const m = String(watDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(watDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns true if the user can claim their daily reward (new WAT calendar day) */
export function canClaimDailyWAT(lastDailyReward: Date | null | undefined): boolean {
  if (!lastDailyReward) return true;
  return getWATDateString(new Date()) !== getWATDateString(lastDailyReward);
}

/** Returns true if last claim was on the immediately preceding WAT calendar day (streak continues) */
export function isStreakContinuedWAT(lastDailyReward: Date | null | undefined): boolean {
  if (!lastDailyReward) return false;
  const yesterdayWAT = getWATDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  return getWATDateString(lastDailyReward) === yesterdayWAT;
}

/** Milliseconds until next midnight in WAT */
export function msUntilNextMidnightWAT(): number {
  const now = new Date();
  const nowWAT = new Date(now.getTime() + WAT_OFFSET_MS);
  const nextMidnightUTC = Date.UTC(
    nowWAT.getUTCFullYear(),
    nowWAT.getUTCMonth(),
    nowWAT.getUTCDate() + 1,
    0, 0, 0, 0
  ) - WAT_OFFSET_MS;
  return nextMidnightUTC - now.getTime();
}

/** Returns the Date object for the next midnight in WAT */
export function nextMidnightWATDate(): Date {
  return new Date(Date.now() + msUntilNextMidnightWAT());
}

/** Milliseconds until a specific HH:MM in WAT (today if not yet passed, otherwise tomorrow) */
export function msUntilWATTime(hour: number, minute: number): number {
  const now = new Date();
  const nowWAT = new Date(now.getTime() + WAT_OFFSET_MS);

  let targetUTC = Date.UTC(
    nowWAT.getUTCFullYear(), nowWAT.getUTCMonth(), nowWAT.getUTCDate(),
    hour, minute, 0, 0
  ) - WAT_OFFSET_MS;

  if (targetUTC <= now.getTime()) {
    targetUTC = Date.UTC(
      nowWAT.getUTCFullYear(), nowWAT.getUTCMonth(), nowWAT.getUTCDate() + 1,
      hour, minute, 0, 0
    ) - WAT_OFFSET_MS;
  }

  return targetUTC - now.getTime();
}

/** Human-readable time remaining until next midnight WAT (e.g. "3h 42m") */
export function timeUntilMidnightWATStr(): string {
  const ms = msUntilNextMidnightWAT();
  const totalMins = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins > 0 ? ` ${mins}m` : ""}`;
}
