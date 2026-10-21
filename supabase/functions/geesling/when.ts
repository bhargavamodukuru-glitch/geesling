// When a request is for: "tomorrow at 12pm", "friday night", "lunch". Pure and import-free (tests/when.test.ts).
// Explicit dates ("Oct 21", "2026-10-21") are read by requestedDateRange in index.ts; this covers the everyday words.

export interface DayKey {
  year: number;
  /** 0-based, like Date. */
  month: number;
  day: number;
}

const ZONE = "America/Toronto";

export function torontoDay(d: Date): DayKey {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

function addDays(day: DayKey, n: number): DayKey {
  const d = new Date(Date.UTC(day.year, day.month, day.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

function weekday(day: DayKey): number {
  return new Date(Date.UTC(day.year, day.month, day.day)).getUTCDay();
}

/** The instant it is `minutes` after midnight on `day` in Toronto (handles daylight saving). */
export function torontoTime(day: DayKey, minutes: number): Date {
  const guess = Date.UTC(day.year, day.month, day.day, 0, minutes);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shownAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (shownAsUtc - guess));
}

// Full names only (plus "tues" and "thurs"): "sun" or "sat" are ordinary words too often.
const WEEKDAYS: Array<[RegExp, number]> = [
  [/\bsunday\b/, 0], [/\bmonday\b/, 1], [/\btues(day)?\b/, 2], [/\bwednesday\b/, 3],
  [/\bthurs(day)?\b/, 4], [/\bfriday\b/, 5], [/\bsaturday\b/, 6],
];

/**
 * A day named with everyday words, relative to `now` in Toronto: today/tonight, tomorrow, a weekday
 * (the next one, or the one after with "next"), or the weekend (the coming Saturday). Null when none is named.
 */
export function relativeDay(prompt: string, now: Date): DayKey | null {
  const text = prompt.toLowerCase();
  const today = torontoDay(now);
  if (/\b(tomorrow|tmrw|tmr|tomorow)\b/.test(text)) return addDays(today, 1);
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(text)) return today;
  if (/\b(this|the) weekend\b/.test(text)) {
    const w = weekday(today);
    return w === 0 || w === 6 ? today : addDays(today, 6 - w);
  }
  for (const [pattern, target] of WEEKDAYS) {
    const match = new RegExp(`\\b(next |this |on )?${pattern.source.slice(2)}`).exec(text);
    if (!match) continue;
    let ahead = (target - weekday(today) + 7) % 7;
    if (match[1] === "next " && ahead === 0) ahead = 7;
    return addDays(today, ahead);
  }
  return null;
}

const MEALS: Array<[RegExp, number]> = [
  [/\bbreakfast\b/, 9 * 60],
  [/\bbrunch\b/, 11 * 60],
  [/\blunch\b/, 12 * 60],
  [/\b(dinner|supper)\b/, 18 * 60],
  [/\btonight\b|\bthis evening\b/, 19 * 60],
];

/**
 * A time of day the person named, in minutes after midnight: "at 12pm", "7:30 pm", "noon", "at 7" (read as 7 pm),
 * or a meal word when no clock time is given ("lunch" = 12:00). Null when none is named.
 */
export function requestedClock(prompt: string): number | null {
  const text = prompt.toLowerCase();
  if (/\bnoon\b|\bmidday\b/.test(text)) return 12 * 60;
  const withSuffix = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/.exec(text);
  const bare = /\b(?:at|around|by|from)\s+(\d{1,2})(?::(\d{2}))?\b(?!\s*(?:hours?|hrs?|h\b|minutes?|mins?|people|of us|km|%))/.exec(text);
  const match = withSuffix ?? bare;
  if (match) {
    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const suffix = withSuffix ? withSuffix[3].replace(/\./g, "") : null;
    if (hour <= 23 && minute <= 59) {
      if (suffix === "pm" && hour < 12) hour += 12;
      else if (suffix === "am" && hour === 12) hour = 0;
      else if (!suffix && hour >= 1 && hour <= 8) hour += 12; // "at 7" means the evening, not 7 am
      return hour * 60 + minute;
    }
  }
  for (const [pattern, minutes] of MEALS) if (pattern.test(text)) return minutes;
  return null;
}

/** When a future day is named without a time, the walk starts at this time instead of midnight. */
export const DEFAULT_START_MINUTES = 10 * 60;

/**
 * Where the walk should start. A named time wins; a named future day with no time starts at 10 am;
 * a time that has already passed today falls back to now.
 */
export function requestedStart(prompt: string, now: Date, day: DayKey | null): Date | null {
  const clock = requestedClock(prompt);
  const today = torontoDay(now);
  const target = day ?? today;
  const isToday = target.year === today.year && target.month === today.month && target.day === today.day;
  if (clock === null) return isToday ? null : torontoTime(target, DEFAULT_START_MINUTES);
  const at = torontoTime(target, clock);
  return at.getTime() > now.getTime() ? at : null;
}
