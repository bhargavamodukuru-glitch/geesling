import type { EventItem, MapItem, PlaceItem, TimeWindow } from "./types";

const TZ = "America/Toronto";

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...opts });
const dayKey = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });
const shortDate = fmt({ month: "short", day: "numeric" });
const weekdayDate = fmt({ weekday: "short", month: "short", day: "numeric" });
const clockFmt = fmt({ hour: "numeric", minute: "2-digit" });

export function clock(iso: string | Date): string {
  return clockFmt
    .format(typeof iso === "string" ? new Date(iso) : iso)
    .replace(":00", "")
    .replace(/\s/g, "")
    .replace("a.m.", "am")
    .replace("p.m.", "pm");
}

export function torontoDay(at: Date): string {
  return dayKey.format(at);
}

/** UTC instants spanning one Toronto calendar day, including DST transitions. */
export function torontoDateRange(key: string): { from: Date; to: Date } {
  const [year, month, day] = key.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextKey = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDay.getUTCDate()).padStart(2, "0")}`;
  return { from: torontoMidnight(key), to: torontoMidnight(nextKey) };
}

function torontoMidnight(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let instant = target;
  const partsFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  // Reconcile the desired wall-clock midnight against Toronto's offset.
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(partsFormat.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    instant += target - represented;
  }
  return new Date(instant);
}

/** Label shown on the pin: LIVE while happening, "Tonight 8pm" today, otherwise the confirmed date. */
export function pinLabel(event: EventItem, now = new Date()): string {
  if (event.is_live) return "LIVE";
  const start = new Date(event.next_start);
  if (torontoDay(start) === torontoDay(now)) return clock(start);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (torontoDay(start) === torontoDay(tomorrow)) return "Tmrw";
  return shortDate.format(start);
}

export function whenLabel(event: EventItem, now = new Date()): string {
  const start = new Date(event.next_start);
  const end = new Date(event.next_end);
  if (event.is_live) return `Happening now · until ${clock(end)}`;
  const day = torontoDay(start) === torontoDay(now) ? "Today" : weekdayDate.format(start);
  return `${day}, ${clock(start)}–${clock(end)}`;
}

export function priceLabel(item: MapItem): string {
  if (item.kind === "place") return placePrice(item);
  if (item.is_free) return "Free";
  if (item.price_min !== null) {
    const min = `$${formatMoney(item.price_min)}`;
    return item.price_max !== null && item.price_max !== item.price_min ? `${min}–$${formatMoney(item.price_max)}` : min;
  }
  return item.price_note ?? "Paid";
}

function formatMoney(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function placePrice(place: PlaceItem): string {
  if (place.is_free) return "Free";
  switch (place.price_level) {
    case "PRICE_LEVEL_INEXPENSIVE":
      return "$";
    case "PRICE_LEVEL_MODERATE":
      return "$$";
    case "PRICE_LEVEL_EXPENSIVE":
      return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "$$$$";
    default:
      return "Paid";
  }
}

export function placeType(place: PlaceItem): string {
  const type = place.primary_type ?? place.types[0] ?? "spot";
  return type.replace(/_/g, " ");
}

export function minutes(totalSeconds: number): string {
  const m = Math.max(1, Math.round(totalSeconds / 60));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

export function distance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`;
}

/** [from, to] for each time-window chip. Weekend is Saturday and Sunday in Toronto. */
export function windowRange(window: TimeWindow, now = new Date()): { from: Date; to: Date } {
  const endOfTorontoDay = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return new Date(d.getTime() + ((23 - h) * 60 + (59 - m)) * 60_000);
  };
  switch (window) {
    case "now":
      return { from: now, to: new Date(now.getTime() + 60_000) };
    case "today":
      return { from: now, to: endOfTorontoDay(now) };
    case "weekend": {
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
      const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
      const [year, month, day] = torontoDay(now).split("-").map(Number);
      const daysToSaturday = index === 0 ? -1 : (6 - index + 7) % 7;
      const saturday = new Date(Date.UTC(year, month - 1, day + daysToSaturday));
      const sunday = new Date(Date.UTC(saturday.getUTCFullYear(), saturday.getUTCMonth(), saturday.getUTCDate() + 1));
      const saturdayKey = calendarKey(saturday);
      const sundayKey = calendarKey(sunday);
      return { from: torontoDateRange(saturdayKey).from, to: torontoDateRange(sundayKey).to };
    }
    case "week":
      return { from: now, to: new Date(now.getTime() + 7 * 86_400_000) };
  }
}

function calendarKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export const WINDOW_LABELS: Record<TimeWindow, string> = {
  now: "Live now",
  today: "Today",
  weekend: "Weekend",
  week: "This week",
};
