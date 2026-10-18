// City of Toronto "Festivals & Events" open data feed (Open Government Licence – Toronto).
// https://open.toronto.ca/dataset/festivals-events/
import type { IngestConfig, NormalizedEvent, Session, SourceResult } from "../lib/types.ts";
import {
  detectAlcohol,
  detectRsvp,
  inferCategories,
  isInToronto,
  mapLabels,
  qualityScore,
  stripHtml,
} from "../lib/classify.ts";
import { normalizeSchedule, parseClock, summarizeSchedule, torontoLocalToUtc, torontoWeekday } from "../lib/time.ts";

interface WeekdaySpec {
  checked?: boolean;
  stime?: string;
  etime?: string;
}

interface MultipleDateSpec {
  sdate?: string;
  edate?: string;
  stime?: string;
  etime?: string;
}

interface DateSpec {
  startdate?: string;
  starttime?: string;
  enddate?: string;
  endtime?: string;
  allday_chk?: string;
  midnight_chk?: string;
  event_frequency?: string;
  repeat_enddate?: string;
  repeat_weekdays?: WeekdaySpec[];
  multiple_dates?: MultipleDateSpec[];
}

interface TorontoLocation {
  location_name?: string | null;
  location_address?: string | null;
  location_gps?: string | null;
  geo_lat?: string | null;
  geo_long?: string | null;
  location_dates?: string | null;
}

interface TorontoEvent {
  id: string;
  event_name?: string;
  event_description?: string | null;
  short_description?: string | null;
  event_category?: string[] | null;
  event_theme?: string[] | null;
  event_features?: string[] | null;
  event_locations?: TorontoLocation[] | null;
  event_dates?: Array<{ date: number }> | null;
  event_startdate?: string | null;
  event_enddate?: string | null;
  event_status?: string | null;
  event_website?: string | null;
  ticket_website?: string | null;
  free_event?: string | null;
  reservations_required?: string | null;
  accessible_event?: string | null;
  cost_notes?: string | null;
  event_price?: string | null;
  event_price_low?: string | null;
  event_price_high?: string | null;
  event_price_adult?: string | null;
  event_price_pwyc?: string | null;
}

const DAY_MS = 86_400_000;
const DEFAULT_DURATION_MIN = 120;

function* daysBetween(start: string, end: string): Generator<string> {
  const startMs = Date.parse(`${start}T12:00:00Z`);
  const endMs = Date.parse(`${end}T12:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
  for (let t = startMs, i = 0; t <= endMs && i < 400; t += DAY_MS, i++) {
    yield new Date(t).toISOString().slice(0, 10);
  }
}

interface Built {
  session: Session;
  endKnown: boolean;
}

function buildSession(date: string, endDate: string, stime: string | undefined, etime: string | undefined, allDay: boolean): Built | null {
  if (allDay) {
    return {
      session: {
        start: torontoLocalToUtc(date, 0).toISOString(),
        end: torontoLocalToUtc(endDate, 23 * 60 + 59).toISOString(),
      },
      endKnown: true,
    };
  }
  const startMin = parseClock(stime);
  if (startMin === null) return null;
  const start = torontoLocalToUtc(date, startMin);
  const endMin = parseClock(etime);
  if (endMin === null) {
    return { session: { start: start.toISOString(), end: new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000).toISOString() }, endKnown: false };
  }
  let end = torontoLocalToUtc(endDate, endMin);
  if (end <= start) end = new Date(end.getTime() + DAY_MS); // e.g. 9pm–2am
  return { session: { start: start.toISOString(), end: end.toISOString() }, endKnown: true };
}

function sessionsFromSpec(spec: DateSpec): Built[] {
  const out: Built[] = [];
  const start = spec.startdate;
  if (!start) return out;
  const allDay = Boolean(spec.allday_chk);
  const endTime = spec.midnight_chk ? "11:59 PM" : spec.endtime;
  const frequency = (spec.event_frequency ?? "Single Date").toLowerCase();

  if (frequency === "daily") {
    for (const day of daysBetween(start, spec.repeat_enddate || spec.enddate || start)) {
      const built = buildSession(day, day, spec.starttime, endTime, allDay);
      if (built) out.push(built);
    }
  } else if (frequency === "weekly") {
    const weekdays = spec.repeat_weekdays ?? [];
    for (const day of daysBetween(start, spec.repeat_enddate || spec.enddate || start)) {
      const weekday = torontoWeekday(new Date(`${day}T17:00:00Z`));
      const rule = weekdays[weekday];
      if (weekdays.length === 7 && !rule?.checked) continue;
      const built = buildSession(day, day, rule?.stime || spec.starttime, rule?.etime || endTime, allDay);
      if (built) out.push(built);
    }
  } else {
    const first = buildSession(start, spec.enddate || start, spec.starttime, endTime, allDay);
    if (first) out.push(first);
    for (const extra of spec.multiple_dates ?? []) {
      if (!extra.sdate) continue;
      const built = buildSession(extra.sdate, extra.edate || extra.sdate, extra.stime || spec.starttime, extra.etime || endTime, allDay);
      if (built) out.push(built);
    }
  }
  return out;
}

function parseCoords(location: TorontoLocation): { lat: number; lng: number } | null {
  if (location.location_gps) {
    try {
      const parsed = JSON.parse(location.location_gps) as Array<{ gps_lat?: number; gps_lng?: number }>;
      const first = parsed[0];
      if (first && typeof first.gps_lat === "number" && typeof first.gps_lng === "number") {
        return { lat: first.gps_lat, lng: first.gps_lng };
      }
    } catch {
      // fall through to geo_lat/geo_long
    }
  }
  const lat = Number(location.geo_lat);
  const lng = Number(location.geo_long);
  if (location.geo_lat && location.geo_long && Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

function parsePrice(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function locationSessions(raw: TorontoEvent, location: TorontoLocation): Built[] {
  if (location.location_dates) {
    try {
      const specs = JSON.parse(location.location_dates) as DateSpec[];
      const built = specs.flatMap(sessionsFromSpec);
      if (built.length > 0) return built;
    } catch {
      // fall back to event_dates
    }
  }
  return (raw.event_dates ?? [])
    .filter((d) => typeof d.date === "number")
    .map((d) => ({
      session: {
        start: new Date(d.date).toISOString(),
        end: new Date(d.date + DEFAULT_DURATION_MIN * 60_000).toISOString(),
      },
      endKnown: false,
    }));
}

function normalize(raw: TorontoEvent, location: TorontoLocation, index: number, config: IngestConfig): NormalizedEvent | null {
  const title = raw.event_name?.trim();
  if (!title) return null;
  const coords = parseCoords(location);
  if (!coords || !isInToronto(coords.lat, coords.lng)) return null;

  const built = locationSessions(raw, location);
  const schedule = normalizeSchedule(built.map((b) => b.session), config.now, config.horizonDays);
  if (schedule.length === 0) return null;
  const endsKnown = built.every((b) => b.endKnown);

  const description = stripHtml(raw.event_description) ?? stripHtml(raw.short_description);
  const costNotes = stripHtml(raw.cost_notes);
  const features = raw.event_features ?? [];
  const ageMin = features.some((f) => /19\+/.test(f)) ? 19 : null;
  const labels = [...(raw.event_category ?? []), ...(raw.event_theme ?? [])];
  const text = `${title}\n${description ?? ""}\n${costNotes ?? ""}`;
  const categories = inferCategories(title, description, mapLabels(labels));

  const isFree = raw.free_event === "Yes";
  const prices = [raw.event_price_low, raw.event_price_high, raw.event_price, raw.event_price_adult]
    .map(parsePrice)
    .filter((p): p is number => p !== null);
  const pwyc = Boolean(raw.event_price_pwyc && /yes|true|1/i.test(raw.event_price_pwyc));
  const rsvp = raw.reservations_required === "Yes" || detectRsvp(`${costNotes ?? ""}\n${description ?? ""}`);

  const base = {
    source: "toronto" as const,
    source_id: index === 0 ? raw.id : `${raw.id}:${index}`,
    title,
    description,
    categories,
    tags: labels.map((l) => l.toLowerCase()),
    url: raw.event_website || null,
    image_url: null,
    venue_name: location.location_name?.trim() || null,
    address: location.location_address?.trim() || null,
    lat: coords.lat,
    lng: coords.lng,
    is_free: isFree,
    price_min: isFree ? null : prices.length ? Math.min(...prices) : null,
    price_max: isFree ? null : prices.length ? Math.max(...prices) : null,
    currency: "CAD",
    price_note: pwyc ? "Pay what you can" : costNotes ? costNotes.slice(0, 300) : null,
    rsvp_required: rsvp,
    rsvp_note: rsvp ? (costNotes?.slice(0, 300) ?? "Reservations required") : null,
    ticket_url: raw.ticket_website || null,
    involves_alcohol: detectAlcohol(`${text}\n${features.join(" ")}`, ageMin, categories),
    age_min: ageMin,
    accessible: raw.accessible_event === "Yes" ? true : raw.accessible_event === "No" ? false : null,
    schedule,
    schedule_summary: summarizeSchedule(schedule),
    first_start_at: schedule[0].start,
    last_end_at: schedule.reduce((max, s) => (s.end > max ? s.end : max), schedule[0].end),
  };
  return { ...base, quality_score: qualityScore(base, endsKnown) };
}

/** The feed lists recurring events as several rows; merge rows with the same title + venue into one schedule. */
function mergeRows(events: NormalizedEvent[], config: IngestConfig): NormalizedEvent[] {
  const groups = new Map<string, NormalizedEvent>();
  for (const event of events) {
    const key = `${event.title.toLowerCase().replace(/\W+/g, " ").trim()}|${event.lat.toFixed(4)}|${event.lng.toFixed(4)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, event);
      continue;
    }
    const schedule = normalizeSchedule([...existing.schedule, ...event.schedule], config.now, config.horizonDays);
    const primary = event.quality_score > existing.quality_score ? event : existing;
    // Keep the lexicographically smallest id so the merged record is stable across runs.
    const sourceId = existing.source_id < event.source_id ? existing.source_id : event.source_id;
    groups.set(key, {
      ...primary,
      source_id: sourceId,
      schedule,
      schedule_summary: summarizeSchedule(schedule),
      first_start_at: schedule[0].start,
      last_end_at: schedule.reduce((max, s) => (s.end > max ? s.end : max), schedule[0].end),
    });
  }
  return [...groups.values()];
}

export async function fetchToronto(config: IngestConfig): Promise<SourceResult> {
  const response = await fetch(config.torontoFeedUrl, { headers: { "User-Agent": "Geesling/1.0 (+https://github.com/bhargavamodukuru-glitch/geesling)" } });
  if (!response.ok) throw new Error(`City of Toronto feed returned ${response.status}`);
  const body = (await response.json()) as { value?: TorontoEvent[] } | TorontoEvent[];
  const rows = Array.isArray(body) ? body : (body.value ?? []);
  const nowIso = config.now.toISOString();

  const normalized: NormalizedEvent[] = [];
  let skipped = 0;
  for (const raw of rows) {
    if (raw.event_status && raw.event_status !== "Approved") {
      skipped++;
      continue;
    }
    if (raw.event_enddate && raw.event_enddate < nowIso.slice(0, 10)) {
      skipped++;
      continue;
    }
    const locations = raw.event_locations ?? [];
    let produced = false;
    locations.forEach((location, index) => {
      const event = normalize(raw, location, index, config);
      if (event) {
        normalized.push(event);
        produced = true;
      }
    });
    if (!produced) skipped++;
  }
  return { source: "toronto", events: mergeRows(normalized, config), fetched: rows.length, skipped };
}
