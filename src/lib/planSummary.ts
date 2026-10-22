// Plan-level summary of a walk: total time, travel, booking and what is actually known about cost.
// Pure and type-only imports, so it runs under plain Node in tests/planSummary.test.ts.
import type { MapItem, Walk, WalkStop } from "./types";

export interface CostSummary {
  /** Stops that are confirmed free. */
  freeStops: number;
  /** Stops with a listed price: an event ticket, or a place's per-person range from Google. */
  pricedStops: number;
  /** Stops with no listed price (paid or unknown). Google gives $ levels, not amounts, so these are not guessed. */
  unknownStops: number;
  /** Sum of the lowest and highest listed prices, per person. Zero when nothing is priced. */
  knownMin: number;
  knownMax: number;
  /** A place's range has no top ("$100+"), so knownMax is a floor. */
  openEnded: boolean;
  currency: string;
}

export interface PlanSummary {
  stops: number;
  /** Start of the first leg to the end of the last stop. */
  totalMinutes: number;
  travelMinutes: number;
  stopMinutes: number;
  /** Time spent waiting for an event to start; only counted when it is noticeable. */
  waitMinutes: number;
  usesTransit: boolean;
  /** At least one leg is an estimate rather than a routed time. */
  estimatedTravel: boolean;
  cost: CostSummary;
  /** Names of stops that need a ticket or RSVP ahead of time. */
  bookAhead: string[];
}

const toMinutes = (seconds: number) => Math.round(seconds / 60);

function stopName(item: MapItem): string {
  return item.kind === "event" ? item.title : item.name;
}

export function summarizePlan(walk: Walk): PlanSummary {
  const cost: CostSummary = { freeStops: 0, pricedStops: 0, unknownStops: 0, knownMin: 0, knownMax: 0, openEnded: false, currency: "CAD" };
  const bookAhead: string[] = [];
  let travelSeconds = 0;
  let stopMinutes = 0;
  let usesTransit = false;
  let estimatedTravel = false;

  for (const stop of walk.stops) {
    const item = stop.item;
    if (item.is_free) {
      cost.freeStops += 1;
    } else if (item.kind === "event" && item.price_min !== null) {
      cost.pricedStops += 1;
      cost.knownMin += item.price_min;
      cost.knownMax += item.price_max ?? item.price_min;
      cost.currency = item.currency || cost.currency;
    } else if (item.kind === "place" && item.price_level === "PRICE_LEVEL_FREE") {
      cost.freeStops += 1;
    } else if (item.kind === "place" && typeof item.price_from === "number") {
      cost.pricedStops += 1;
      cost.knownMin += item.price_from;
      cost.knownMax += item.price_to ?? item.price_from;
      if (typeof item.price_to !== "number") cost.openEnded = true;
    } else {
      cost.unknownStops += 1;
    }
    if (item.kind === "event" && item.rsvp_required) bookAhead.push(stopName(item));
    stopMinutes += stop.stay_minutes;
    if (stop.leg) {
      travelSeconds += stop.leg.duration_s;
      if (stop.leg.mode === "transit") usesTransit = true;
      if (stop.leg.estimated) estimatedTravel = true;
    }
  }

  const travelMinutes = toMinutes(travelSeconds);
  const busy = travelMinutes + stopMinutes;
  const totalMinutes = walk.total_minutes ?? busy;
  const wait = totalMinutes - busy;

  return {
    stops: walk.stops.length,
    totalMinutes,
    travelMinutes,
    stopMinutes,
    waitMinutes: wait >= 10 ? wait : 0,
    usesTransit,
    estimatedTravel,
    cost,
    bookAhead,
  };
}

/** "45 min", "1 h", "2 h 3 min". */
export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/**
 * One honest line about cost. It only states what is listed: confirmed free stops, listed ticket prices and Google price ranges,
 * and how many stops have no listed price. It never turns a "$$" level into a dollar amount.
 */
export function costLine(cost: CostSummary): string {
  const unknown = cost.unknownStops;
  const unknownText = `${unknown} stop${unknown === 1 ? "" : "s"} with no listed price`;
  if (cost.pricedStops === 0) {
    return unknown === 0 ? "Free" : `Price not listed: ${unknownText}`;
  }
  const range = cost.openEnded
    ? `${money(cost.knownMin)}+`
    : cost.knownMin === cost.knownMax ? money(cost.knownMax) : `${money(cost.knownMin)}–${money(cost.knownMax)}`;
  const listed = `${range} per person`;
  return unknown === 0 ? listed : `${listed} · ${unknownText}`;
}

export function travelLine(summary: PlanSummary): string {
  if (summary.travelMinutes === 0) return "No travel between stops";
  const how = summary.usesTransit ? "walking + TTC" : "walking";
  return `${formatDuration(summary.travelMinutes)} travelling (${how})${summary.estimatedTravel ? ", approx." : ""}`;
}

/** Total distance of a route's legs, km. */
export function routeDistanceKm(walk: Walk): number {
  return walk.stops.reduce((sum, stop) => sum + (stop.leg?.distance_m ?? 0), 0) / 1000;
}

/** "6:00/km" (same format as the guide's run.ts). */
export function paceLabel(paceMinPerKm: number): string {
  const whole = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - whole) * 60);
  return seconds === 60 ? `${whole + 1}:00/km` : `${whole}:${String(seconds).padStart(2, "0")}/km`;
}

/** The headline for a running route: "🏃 15.2 km · about 1 h 31 min at 6:00/km". */
export function runLine(walk: Walk): string {
  const km = routeDistanceKm(walk);
  const runSeconds = walk.stops.reduce((sum, stop) => sum + (stop.leg?.duration_s ?? 0), 0);
  const pace = walk.run_pace_min_per_km ? ` at ${paceLabel(walk.run_pace_min_per_km)}` : "";
  return `🏃 ${km.toFixed(1)} km · about ${formatDuration(runSeconds / 60)}${pace}`;
}

/** How the timing works out at an event stop once you've travelled there. Null for places. */
export interface EventTime {
  /** When the event ends (ISO). */
  endsAt: string;
  /** Minutes between arriving and the end (negative once it has ended). */
  minutesLeft: number;
  /** Less than 30 minutes left (or most of a short event), the same bar the guide plans to. */
  tight: boolean;
  ended: boolean;
}

export function eventTime(stop: WalkStop): EventTime | null {
  if (stop.item.kind !== "event") return null;
  const { next_start: start, next_end: end } = stop.item;
  const minutesLeft = Math.round((Date.parse(end) - Date.parse(stop.arrive_at)) / 60_000);
  const needed = Math.min(30, Math.max(10, Math.round(((Date.parse(end) - Date.parse(start)) / 60_000) * 0.8)));
  return { endsAt: end, minutesLeft, ended: minutesLeft <= 0, tight: minutesLeft > 0 && minutesLeft < needed };
}
