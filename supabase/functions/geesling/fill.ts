// Whether a walk leaves most of the requested time empty. Pure and import-free (tests/fill.test.ts).

/** A walk shorter than this share of the time budget is sent back once to be filled out. */
export const MIN_FILL_SHARE = 0.6;

export function leavesTooMuchTime(walkMinutes: number, budgetMinutes: number | null, stopCount: number): boolean {
  if (budgetMinutes === null || budgetMinutes < 90) return false; // short outings are fine as they are
  if (stopCount >= 6) return false; // already a full walk
  return walkMinutes < budgetMinutes * MIN_FILL_SHARE;
}

const WORD_HOURS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/**
 * A duration the person wrote in their message ("12 hours", "3-4 hrs", "half a day", "all day"), in minutes.
 * Used only when the time chips were left on "Any time". Null when nothing is stated.
 */
export function statedDuration(prompt: string): number | null {
  const text = prompt.toLowerCase();
  const clamp = (m: number) => Math.min(Math.max(Math.round(m), 30), 16 * 60);
  const hours = /\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:hours?|hrs?|h)\b/.exec(text);
  if (hours) {
    const n = Number(hours[2] ?? WORD_HOURS[hours[1]] ?? hours[1]); // a range counts as its top
    if (Number.isFinite(n) && n > 0) return clamp(n * 60);
  }
  const minutes = /\b(\d+)\s*(?:minutes?|mins?)\b/.exec(text);
  if (minutes) return clamp(Number(minutes[1]));
  if (/\b(all|whole|full|entire)\s+day\b/.test(text)) return 600;
  if (/\bhalf\s+(?:a\s+)?day\b|\bhalf-day\b/.test(text)) return 360;
  if (/\b(a\s+)?couple\s+(of\s+)?hours\b/.test(text)) return 120;
  if (/\b(a\s+)?few\s+hours\b/.test(text)) return 180;
  return null;
}

/** Most places close by 2 am, so a late request can only fill the hours left tonight. */
export const LAST_CALL_HOUR = 2;

/**
 * Minutes from `start` until the 2 am cutoff in Toronto, or null in the small hours (2–6 am)
 * when there is no sensible cutoff to apply.
 */
export function minutesLeftTonight(start: Date): number | null {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(start);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  const now = h * 60 + m;
  if (h >= LAST_CALL_HOUR && h < 6) return null;
  return h < LAST_CALL_HOUR ? LAST_CALL_HOUR * 60 - now : (24 + LAST_CALL_HOUR) * 60 - now;
}
