// Plan-level summary of a walk: total time, travel, booking and what is actually known about cost.
// Pure and type-only imports, so it runs under plain Node in tests/planSummary.test.ts.
import type { MapItem, Walk } from "./types";

export interface CostSummary {
  /** Stops that are confirmed free. */
  freeStops: number;
  /** Stops with a listed ticket price. */
  pricedStops: number;
  /** Stops with no listed price (paid or unknown). Google gives $ levels, not amounts, so these are not guessed. */
  unknownStops: number;
  /** Sum of the lowest and highest listed ticket prices (per ticket). Zero when nothing is priced. */
  knownMin: number;
  knownMax: number;
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
  const cost: CostSummary = { freeStops: 0, pricedStops: 0, unknownStops: 0, knownMin: 0, knownMax: 0, currency: "CAD" };
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
 * One honest line about cost. It only states what is listed: confirmed free stops, listed ticket prices,
 * and how many stops have no listed price. It never turns a "$$" level into a dollar amount.
 */
export function costLine(cost: CostSummary): string {
  const unknown = cost.unknownStops;
  const unknownText = `${unknown} stop${unknown === 1 ? "" : "s"} with no listed price`;
  if (cost.pricedStops === 0) {
    return unknown === 0 ? "Free" : `Price not listed: ${unknownText}`;
  }
  const range = cost.knownMin === cost.knownMax ? money(cost.knownMax) : `${money(cost.knownMin)}–${money(cost.knownMax)}`;
  const tickets = `Tickets ${range} each`;
  return unknown === 0 ? tickets : `${tickets} · ${unknownText}`;
}

export function travelLine(summary: PlanSummary): string {
  if (summary.travelMinutes === 0) return "No travel between stops";
  const how = summary.usesTransit ? "walking + TTC" : "walking";
  return `${formatDuration(summary.travelMinutes)} travelling (${how})${summary.estimatedTravel ? ", approx." : ""}`;
}
