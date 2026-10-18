import type { Session } from "./types.ts";

export const TORONTO_TZ = "America/Toronto";

const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TORONTO_TZ,
  timeZoneName: "longOffset",
});

/** Offset of Toronto from UTC in minutes at the given instant (e.g. -240 during EDT). */
export function torontoOffsetMinutes(at: Date): number {
  const part = offsetFormatter.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(part);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/** Parses "07:00 PM", "7 p.m.", "19:30" into minutes after midnight, or null. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = value.trim().toLowerCase().replace(/\./g, "");
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Converts a Toronto wall-clock date ("2026-10-20") + minutes after midnight into a UTC Date. */
export function torontoLocalToUtc(date: string, minutesAfterMidnight: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutesAfterMidnight);
  // Two passes handle DST transitions correctly.
  let offset = torontoOffsetMinutes(new Date(guess));
  let utc = guess - offset * 60_000;
  offset = torontoOffsetMinutes(new Date(utc));
  utc = guess - offset * 60_000;
  return new Date(utc);
}

/** Toronto calendar date (YYYY-MM-DD) of an instant. */
export function torontoDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** 0 = Sunday … 6 = Saturday, in Toronto. */
export function torontoWeekday(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TORONTO_TZ, weekday: "short" }).format(at);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TORONTO_TZ, weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TORONTO_TZ, hour: "numeric", minute: "2-digit" });

function clock(at: Date): string {
  return timeFmt.format(at).replace(":00", "").replace(/\s/g, "").replace("a.m.", "am").replace("p.m.", "pm");
}

/** Sorts, de-duplicates and trims sessions to [now, now + horizon]. */
export function normalizeSchedule(sessions: Session[], now: Date, horizonDays: number): Session[] {
  const horizon = now.getTime() + horizonDays * 86_400_000;
  const seen = new Set<string>();
  return sessions
    .filter((s) => {
      const start = Date.parse(s.start);
      const end = Date.parse(s.end);
      return Number.isFinite(start) && Number.isFinite(end) && end > now.getTime() && start < horizon && end > start;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .filter((s) => {
      const key = `${s.start}|${s.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 150);
}

/** Human-readable summary such as "Sat Oct 24, 7pm–10pm" or "Every Sat & Sun, 10am–4pm · until Dec 13". */
export function summarizeSchedule(sessions: Session[]): string | null {
  if (sessions.length === 0) return null;
  const first = sessions[0];
  const firstStart = new Date(first.start);
  const firstEnd = new Date(first.end);
  if (sessions.length === 1) {
    const sameDay = torontoDate(firstStart) === torontoDate(firstEnd);
    return sameDay
      ? `${dayFmt.format(firstStart)}, ${clock(firstStart)}–${clock(firstEnd)}`
      : `${dayFmt.format(firstStart)} – ${dayFmt.format(firstEnd)}`;
  }
  const last = new Date(sessions[sessions.length - 1].start);
  const weekdays = new Set(sessions.map((s) => torontoWeekday(new Date(s.start))));
  const times = new Set(sessions.map((s) => `${clock(new Date(s.start))}–${clock(new Date(s.end))}`));
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const until = `until ${dayFmt.format(last).replace(/^\w+, /, "")}`;
  const timePart = times.size === 1 ? `, ${[...times][0]}` : "";
  if (weekdays.size === 7) return `Daily${timePart} · ${until}`;
  if (weekdays.size <= 3) {
    const list = [...weekdays].sort().map((d) => names[d]).join(" & ");
    return `Every ${list}${timePart} · ${until}`;
  }
  return `${sessions.length} dates from ${dayFmt.format(firstStart)}${timePart} · ${until}`;
}
