// Ticketmaster Discovery API v2 — concerts, club nights, sports, theatre.
// https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
import type { IngestConfig, NormalizedEvent, Session, SourceResult } from "../lib/types.ts";
import { detectAlcohol, detectRsvp, inferCategories, isInToronto, mapLabels, qualityScore, stripHtml } from "../lib/classify.ts";
import { normalizeSchedule, summarizeSchedule, torontoLocalToUtc, parseClock } from "../lib/time.ts";

interface TmClassification {
  segment?: { name?: string };
  genre?: { name?: string };
  subGenre?: { name?: string };
}

interface TmVenue {
  name?: string;
  address?: { line1?: string };
  city?: { name?: string };
  postalCode?: string;
  location?: { latitude?: string; longitude?: string };
}

interface TmEvent {
  id: string;
  name: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  description?: string;
  images?: Array<{ url: string; width: number; ratio?: string }>;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string; dateTBD?: boolean; timeTBA?: boolean; noSpecificTime?: boolean };
    end?: { localDate?: string; localTime?: string; dateTime?: string };
    status?: { code?: string };
  };
  classifications?: TmClassification[];
  priceRanges?: Array<{ min?: number; max?: number; currency?: string }>;
  ageRestrictions?: { legalAgeEnforced?: boolean };
  _embedded?: { venues?: TmVenue[] };
}

interface TmPage {
  _embedded?: { events?: TmEvent[] };
  page?: { totalPages?: number; number?: number };
}

const BASE = "https://app.ticketmaster.com/discovery/v2/events.json";
const PAGE_SIZE = 199; // Discovery caps deep paging at size * page < 1000
const DEFAULT_DURATION_MIN = 180;

function tmDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchPage(apiKey: string, page: number, from: Date, to: Date): Promise<TmPage> {
  const params = new URLSearchParams({
    apikey: apiKey,
    latlong: "43.6532,-79.3832",
    radius: "35",
    unit: "km",
    countryCode: "CA",
    locale: "*",
    size: String(PAGE_SIZE),
    page: String(page),
    sort: "date,asc",
    startDateTime: tmDate(from),
    endDateTime: tmDate(to),
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${BASE}?${params}`);
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`Ticketmaster returned ${response.status}: ${await response.text()}`);
    return (await response.json()) as TmPage;
  }
  throw new Error("Ticketmaster rate limit persisted after retries");
}

function sessionOf(event: TmEvent): { session: Session; endKnown: boolean } | null {
  const start = event.dates?.start;
  if (!start || start.dateTBD) return null;
  let startAt: Date | null = null;
  if (start.dateTime) startAt = new Date(start.dateTime);
  else if (start.localDate) {
    const minutes = parseClock(start.localTime?.slice(0, 5)) ?? 19 * 60;
    startAt = torontoLocalToUtc(start.localDate, minutes);
  }
  if (!startAt || Number.isNaN(startAt.getTime())) return null;
  const end = event.dates?.end;
  let endAt: Date | null = null;
  if (end?.dateTime) endAt = new Date(end.dateTime);
  else if (end?.localDate) endAt = torontoLocalToUtc(end.localDate, parseClock(end.localTime?.slice(0, 5)) ?? 23 * 60 + 59);
  const endKnown = Boolean(endAt && endAt > startAt);
  return {
    session: {
      start: startAt.toISOString(),
      end: (endKnown && endAt ? endAt : new Date(startAt.getTime() + DEFAULT_DURATION_MIN * 60_000)).toISOString(),
    },
    endKnown,
  };
}

function bestImage(images: TmEvent["images"]): string | null {
  if (!images?.length) return null;
  const wide = images.filter((i) => i.ratio === "16_9").sort((a, b) => b.width - a.width);
  const pick = wide.find((i) => i.width <= 1200) ?? wide[0] ?? images[0];
  return pick.url;
}

function normalize(event: TmEvent, config: IngestConfig): NormalizedEvent | null {
  if (event.dates?.status?.code === "cancelled" || event.dates?.status?.code === "postponed") return null;
  const venue = event._embedded?.venues?.[0];
  const lat = Number(venue?.location?.latitude);
  const lng = Number(venue?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInToronto(lat, lng)) return null;
  const built = sessionOf(event);
  if (!built) return null;
  const schedule = normalizeSchedule([built.session], config.now, config.horizonDays);
  if (schedule.length === 0) return null;

  const classification = event.classifications?.[0];
  const labels = [classification?.segment?.name, classification?.genre?.name, classification?.subGenre?.name].filter(
    (l): l is string => Boolean(l) && l !== "Undefined",
  );
  const description = stripHtml([event.description, event.info].filter(Boolean).join("\n\n"));
  const note = stripHtml(event.pleaseNote);
  const text = `${event.name}\n${description ?? ""}\n${note ?? ""}\n${venue?.name ?? ""}`;
  const categories = inferCategories(event.name, description, mapLabels(labels));
  const ageMin = event.ageRestrictions?.legalAgeEnforced ? 19 : null;
  const prices = (event.priceRanges ?? []).flatMap((p) => [p.min, p.max]).filter((p): p is number => typeof p === "number" && p >= 0);
  const isFree = prices.length > 0 && Math.max(...prices) === 0;
  const address = [venue?.address?.line1, venue?.city?.name, venue?.postalCode].filter(Boolean).join(", ") || null;

  const base = {
    source: "ticketmaster" as const,
    source_id: event.id,
    title: event.name.trim(),
    description,
    categories,
    tags: labels.map((l) => l.toLowerCase()),
    url: event.url ?? null,
    image_url: bestImage(event.images),
    venue_name: venue?.name ?? null,
    address,
    lat,
    lng,
    is_free: isFree,
    price_min: isFree || prices.length === 0 ? null : Math.min(...prices),
    price_max: isFree || prices.length === 0 ? null : Math.max(...prices),
    currency: event.priceRanges?.[0]?.currency ?? "CAD",
    price_note: prices.length === 0 && !isFree ? "Ticketed — see listing for prices" : null,
    // Ticketmaster events are ticketed: always book ahead.
    rsvp_required: true,
    rsvp_note: detectRsvp(note ?? "") && note ? note.slice(0, 300) : "Tickets required — buy ahead on Ticketmaster",
    ticket_url: event.url ?? null,
    involves_alcohol: detectAlcohol(text, ageMin, categories),
    age_min: ageMin,
    accessible: null,
    schedule,
    schedule_summary: summarizeSchedule(schedule),
    first_start_at: schedule[0].start,
    last_end_at: schedule[schedule.length - 1].end,
  };
  return { ...base, quality_score: qualityScore(base, built.endKnown) };
}

export async function fetchTicketmaster(config: IngestConfig): Promise<SourceResult> {
  if (!config.ticketmasterApiKey) throw new Error("TICKETMASTER_API_KEY is not set");
  const events: NormalizedEvent[] = [];
  let fetched = 0;
  let skipped = 0;
  // Walk the horizon in 10-day windows so each window stays under the 1000-result paging cap.
  const windowDays = 10;
  for (let offset = 0; offset < config.horizonDays; offset += windowDays) {
    const from = new Date(config.now.getTime() + offset * 86_400_000);
    const to = new Date(Math.min(config.now.getTime() + (offset + windowDays) * 86_400_000, config.now.getTime() + config.horizonDays * 86_400_000));
    for (let page = 0; page * PAGE_SIZE < 1000; page++) {
      const data = await fetchPage(config.ticketmasterApiKey, page, offset === 0 ? new Date(config.now.getTime() - 6 * 3_600_000) : from, to);
      const batch = data._embedded?.events ?? [];
      fetched += batch.length;
      for (const raw of batch) {
        const event = normalize(raw, config);
        if (event) events.push(event);
        else skipped++;
      }
      const totalPages = data.page?.totalPages ?? 0;
      if (page + 1 >= totalPages) break;
      await new Promise((r) => setTimeout(r, 250)); // stay under 5 req/s
    }
  }
  // Same event can appear in two adjacent windows.
  const unique = new Map(events.map((e) => [e.source_id, e]));
  return { source: "ticketmaster", events: [...unique.values()], fetched, skipped };
}
