// Toronto clock helpers for laying out long outings. Pure and import-free (tests/daytime.test.ts).
// src/lib/dayParts.ts has the same day-part rule for the walk card; keep the two in step.

export type DayPart = "morning" | "afternoon" | "evening";

const ZONE = "America/Toronto";

function torontoParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month") - 1, day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** Morning until noon, afternoon until 4 pm, evening after that (late night counts as evening). */
export function dayPart(d: Date): DayPart {
  const { hour } = torontoParts(d);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 16) return "afternoon";
  return "evening";
}

/** "17:30", "5:30 pm", "5pm" → minutes after midnight; null when unreadable. */
export function parseClock(text: string): number | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const suffix = m[3]?.toLowerCase().replace(/\./g, "");
  if (minute > 59 || hour > 23 || (suffix && (hour < 1 || hour > 12))) return null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

/** Longest a stop may wait for its arrive_after time; anything later is treated as a mistake and ignored. */
export const MAX_WAIT_MINUTES = 6 * 60;

/**
 * The time to arrive at a stop that should not start before `clock` (Toronto time) on the same day as `arrive`.
 * Returns `arrive` unchanged when it is already late enough, the clock is unreadable, or the wait would be absurd.
 */
export function notBefore(arrive: Date, clock: string | undefined): Date {
  if (!clock) return arrive;
  const minutes = parseClock(clock);
  if (minutes === null) return arrive;
  const local = torontoParts(arrive);
  const nowMinutes = local.hour * 60 + local.minute;
  const wait = minutes - nowMinutes;
  if (wait <= 0 || wait > MAX_WAIT_MINUTES) return arrive;
  return new Date(arrive.getTime() + wait * 60_000 - (arrive.getTime() % 60_000));
}
