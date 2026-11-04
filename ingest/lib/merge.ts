// Ticketing listings name every performance separately; one show at one venue becomes one event with a schedule.
import type { IngestConfig, NormalizedEvent } from "./types.ts";
import { normalizeSchedule, summarizeSchedule } from "./time.ts";

export function mergePerformances(events: NormalizedEvent[], config: Pick<IngestConfig, "now" | "horizonDays">): NormalizedEvent[] {
  const groups = new Map<string, NormalizedEvent[]>();
  for (const event of events) {
    const key = `${event.title.toLowerCase().replace(/\W+/g, " ").trim()}|${event.lat.toFixed(3)}|${event.lng.toFixed(3)}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const primary = [...group].sort((a, b) => b.quality_score - a.quality_score)[0];
    const schedule = normalizeSchedule(group.flatMap((e) => e.schedule), config.now, config.horizonDays);
    const mins = group.map((e) => e.price_min).filter((p): p is number => p !== null);
    const maxes = group.map((e) => e.price_max).filter((p): p is number => p !== null);
    return {
      ...primary,
      // Smallest id keeps the merged record stable across runs.
      source_id: group.map((e) => e.source_id).sort()[0],
      price_min: mins.length ? Math.min(...mins) : primary.price_min,
      price_max: maxes.length ? Math.max(...maxes) : primary.price_max,
      schedule,
      schedule_summary: summarizeSchedule(schedule),
      first_start_at: schedule[0].start,
      last_end_at: schedule.reduce((m, s) => (s.end > m ? s.end : m), schedule[0].end),
    };
  });
}
