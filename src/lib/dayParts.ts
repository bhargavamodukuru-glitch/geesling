// Which part of the day a stop falls in, for grouping long walks. Same rule as supabase/functions/geesling/daytime.ts.

export type DayPart = "morning" | "afternoon" | "evening";

export const DAY_PART_LABEL: Record<DayPart, string> = { morning: "MORNING", afternoon: "AFTERNOON", evening: "EVENING" };

/** Walks at least this long are shown in parts of the day. */
export const SPLIT_WALK_MINUTES = 360;

/** Morning until noon, afternoon until 5 pm, evening after that (late night counts as evening). */
export function dayPart(iso: string): DayPart {
  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}
