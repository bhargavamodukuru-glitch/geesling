import type { NormalizedEvent } from "./types.ts";
import { summarizeSchedule, torontoDate } from "./time.ts";

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "of", "at", "in", "on", "with", "w", "for", "to", "by", "presents",
  "live", "toronto", "tickets", "event", "show", "tour", "night", "featuring", "feat", "ft",
]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function distanceMeters(a: NormalizedEvent, b: NormalizedEvent): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Two listings describe the same real-world event: same first day, within ~250 m, similar title. */
export function isDuplicate(a: NormalizedEvent, b: NormalizedEvent): boolean {
  if (a.source === b.source && a.source_id === b.source_id) return true;
  if (torontoDate(new Date(a.first_start_at)) !== torontoDate(new Date(b.first_start_at))) return false;
  if (distanceMeters(a, b) > 250) return false;
  const ta = titleTokens(a.title);
  const tb = titleTokens(b.title);
  const similarity = jaccard(ta, tb);
  if (similarity >= 0.6) return true;
  // "Drake" vs "Drake: $ome $exy $ongs 4 U Tour" — one title contained in the other.
  const smaller = ta.size <= tb.size ? ta : tb;
  const larger = ta.size <= tb.size ? tb : ta;
  return smaller.size >= 1 && [...smaller].every((t) => larger.has(t)) && similarity >= 0.34;
}

export interface DedupeResult {
  winners: NormalizedEvent[];
  duplicatesRemoved: number;
}

/**
 * Clusters duplicates across sources and keeps exactly one record per cluster:
 * the one with the highest quality score (source trust + completeness).
 */
export function dedupe(events: NormalizedEvent[]): DedupeResult {
  // Bucket by Toronto start date to keep comparisons cheap.
  const buckets = new Map<string, NormalizedEvent[]>();
  for (const event of events) {
    const day = torontoDate(new Date(event.first_start_at));
    buckets.set(day, [...(buckets.get(day) ?? []), event]);
  }

  const winners: NormalizedEvent[] = [];
  let duplicatesRemoved = 0;
  for (const bucket of buckets.values()) {
    const clusters: NormalizedEvent[][] = [];
    for (const event of bucket) {
      const cluster = clusters.find((c) => c.some((member) => isDuplicate(member, event)));
      if (cluster) cluster.push(event);
      else clusters.push([event]);
    }
    for (const cluster of clusters) {
      cluster.sort(
        (a, b) =>
          b.quality_score - a.quality_score ||
          b.schedule.length - a.schedule.length ||
          `${a.source}:${a.source_id}`.localeCompare(`${b.source}:${b.source_id}`),
      );
      const winner = cluster[0];
      // Listings from the winner's own source are extra performances, not rival copies: keep their sessions.
      const sameSource = cluster.slice(1).filter((e) => e.source === winner.source);
      if (sameSource.length === 0) {
        winners.push(winner);
      } else {
        const seen = new Set<string>();
        const schedule = [winner, ...sameSource]
          .flatMap((e) => e.schedule)
          .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
          .filter((s) => (seen.has(s.start) ? false : (seen.add(s.start), true)));
        winners.push({
          ...winner,
          schedule,
          schedule_summary: summarizeSchedule(schedule),
          first_start_at: schedule[0].start,
          last_end_at: schedule.reduce((m, s) => (s.end > m ? s.end : m), schedule[0].end),
        });
      }
      duplicatesRemoved += cluster.length - 1;
    }
  }
  return { winners, duplicatesRemoved };
}
