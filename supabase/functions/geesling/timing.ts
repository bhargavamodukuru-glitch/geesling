// Whether a route leaves real time at each event once you've travelled there. Pure and import-free (tests/timing.test.ts).

/** The least time worth arriving with before an event ends (shorter events need most of their length instead). */
export const MIN_EVENT_MINUTES = 30;

export interface TimedStop {
  name: string;
  kind: "event" | "place";
  arrive_at: string;
  next_start?: string;
  next_end?: string;
}

const clock = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Minutes worth having at an event: 30, or 80% of a shorter event (at least 10). */
export function minutesNeeded(startIso: string, endIso: string): number {
  const length = (Date.parse(endIso) - Date.parse(startIso)) / 60_000;
  return Math.min(MIN_EVENT_MINUTES, Math.max(10, Math.round(length * 0.8)));
}

/**
 * Events in the route that you'd reach after they end, or with too little time left.
 * One sentence each, written for the guide so it can reorder, swap or drop the stop.
 */
export function eventTimingProblems(stops: TimedStop[]): string[] {
  const problems: string[] = [];
  for (const stop of stops) {
    if (stop.kind !== "event" || !stop.next_end || !stop.next_start) continue;
    const left = (Date.parse(stop.next_end) - Date.parse(stop.arrive_at)) / 60_000;
    if (left <= 0) {
      problems.push(`${stop.name} ends at ${clock(stop.next_end)}, before you'd arrive at ${clock(stop.arrive_at)}.`);
    } else if (left < minutesNeeded(stop.next_start, stop.next_end)) {
      problems.push(`You'd reach ${stop.name} at ${clock(stop.arrive_at)} and it ends at ${clock(stop.next_end)}: only ${Math.round(left)} min there.`);
    }
  }
  return problems;
}
