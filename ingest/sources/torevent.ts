// torevent.ca: a hand-reviewed Toronto calendar (concerts, comedy, club nights, film, theatre) that collects
// venue listings and readers' submissions. Its site loads every event from one public file, events.js
// (`window.TOREVENT_DATA = {...}`); the same calendar is also published as iCal on Tockify. robots.txt allows all.
// Listings carry a street address but no coordinates, so venues are placed with lib/geocode.ts.
import type { Category, IngestConfig, NormalizedEvent, SourceResult } from "../lib/types.ts";
import { detectAlcohol, inferCategories, mapLabels, qualityScore, stripHtml } from "../lib/classify.ts";
import { normalizeSchedule, summarizeSchedule } from "../lib/time.ts";
import { mergePerformances } from "../lib/merge.ts";
import { locateVenues, venueKey, type VenueCache } from "../lib/geocode.ts";
import { webUrl } from "../lib/url.ts";

export const TOREVENT_FEED = "https://torevent.ca/events.js";

export interface ToreventEvent {
  id: string;
  start: string;
  end: string | null;
  isAllDay: boolean;
  title: string;
  venue: string | null;
  location: string | null;
  categories: string[];
  labels: string[];
  image: string | null;
  url: string | null;
  actionUrl: string | null;
  externalLinks: string[];
  description: string | null;
}

const DEFAULT_DURATION_MIN = 180;

// torevent's own categories → Geesling's. Venue tags ("Roy-Thomson-Hall") are ignored.
const CATEGORY_MAP: Record<string, Category[]> = {
  concert: ["music"],
  comedy: ["comedy"],
  "dj/club/rave": ["nightlife", "music"],
  film: ["film"],
  "dance performance theatre": ["theatre", "arts_culture"],
  history: ["arts_culture"],
  karaoke: ["nightlife"],
  festival: ["festival"],
  "live podcast": ["comedy"],
  competition: ["community"],
  fashion: ["market"],
  market: ["market"],
  art: ["gallery", "arts_culture"],
  literary: ["arts_culture"],
  trivia: ["nightlife", "community"],
  workshop: ["workshop"],
  sports: ["sports"],
};

/** Parses events.js into its list of events. */
export function parseToreventFile(text: string): ToreventEvent[] {
  const match = text.match(/^\s*window\.TOREVENT_DATA\s*=\s*([\s\S]*?);?\s*$/);
  if (!match) throw new Error("torevent: unexpected events.js format");
  const data = JSON.parse(match[1]) as { events?: ToreventEvent[] };
  if (!Array.isArray(data.events)) throw new Error("torevent: events.js has no events list");
  return data.events;
}

export function toreventCategories(raw: string[]): Category[] {
  const out = new Set<Category>();
  for (const label of raw) {
    const key = label.toLowerCase().replace(/-+/g, " ").replace(/\s+/g, " ").trim();
    for (const cat of CATEGORY_MAP[key] ?? CATEGORY_MAP[label.toLowerCase()] ?? []) out.add(cat);
  }
  return [...out];
}

/** "19+" → 19; "All ages" or nothing → null. */
export function ageFromLabels(labels: string[]): number | null {
  const ages = labels.map((l) => l.match(/^(\d{2})\+$/)?.[1]).filter(Boolean).map(Number);
  return ages.length ? Math.max(...ages) : null;
}

export function normalizeTorevent(
  event: ToreventEvent,
  coords: { lat: number; lng: number },
  config: Pick<IngestConfig, "now" | "horizonDays">,
): NormalizedEvent | null {
  const startAt = new Date(event.start);
  if (!event.title?.trim() || Number.isNaN(startAt.getTime())) return null;
  const endAt = event.end ? new Date(event.end) : null;
  const endKnown = Boolean(endAt && endAt > startAt);
  const end = endKnown && endAt ? endAt : new Date(startAt.getTime() + DEFAULT_DURATION_MIN * 60_000);
  const schedule = normalizeSchedule([{ start: startAt.toISOString(), end: end.toISOString() }], config.now, config.horizonDays);
  if (schedule.length === 0) return null;

  const labels = event.labels ?? [];
  const lower = labels.map((l) => l.toLowerCase());
  const isFree = lower.includes("free") || lower.includes("no cover");
  const pwyc = lower.includes("pwyc");
  const ageMin = ageFromLabels(labels);
  const description = stripHtml(event.description);
  const title = event.title.trim();
  const categories = inferCategories(title, description, [...toreventCategories(event.categories ?? []), ...mapLabels(event.categories ?? [])]);
  // The original listing (venue or ticket page) is the useful link; torevent's own page is the fallback.
  const ticketUrl = webUrl(event.actionUrl) ?? (event.externalLinks ?? []).map(webUrl).find(Boolean) ?? null;
  const location = event.location ?? "";
  const address = location.split(",").map((p) => p.trim()).filter((p, i) => p && !(i === 0 && p === event.venue) && !/^canada$/i.test(p)).join(", ") || null;

  const base = {
    source: "torevent" as const,
    source_id: event.id,
    title,
    description,
    categories,
    tags: (event.categories ?? []).map((c) => c.toLowerCase()).slice(0, 6),
    url: ticketUrl ?? webUrl(event.url),
    image_url: webUrl(event.image),
    venue_name: event.venue?.trim() || null,
    address,
    lat: coords.lat,
    lng: coords.lng,
    is_free: isFree,
    price_min: null,
    price_max: null,
    currency: "CAD",
    price_note: isFree ? null : pwyc ? "Pay what you can" : "See listing for prices",
    rsvp_required: false,
    rsvp_note: null,
    ticket_url: ticketUrl,
    involves_alcohol: detectAlcohol(`${title}\n${description ?? ""}\n${event.venue ?? ""}`, ageMin, categories),
    age_min: ageMin,
    accessible: null,
    schedule,
    schedule_summary: summarizeSchedule(schedule),
    first_start_at: schedule[0].start,
    last_end_at: schedule[schedule.length - 1].end,
  };
  return { ...base, quality_score: qualityScore(base, endKnown) };
}

export async function fetchTorevent(config: IngestConfig, cache: VenueCache): Promise<SourceResult & { lookups: number; unplaced: number }> {
  const response = await fetch(config.toreventFeedUrl, { headers: { "User-Agent": "Geesling/1.0 (+https://geesling.ca)" } });
  if (!response.ok) throw new Error(`torevent returned ${response.status}`);
  const raw = parseToreventFile(await response.text());
  const horizon = config.now.getTime() + config.horizonDays * 86_400_000;
  // Only events that are still on and inside the horizon need a venue looked up.
  const current = raw.filter((e) => {
    const end = Date.parse(e.end ?? e.start);
    const start = Date.parse(e.start);
    return Number.isFinite(start) && end > config.now.getTime() && start < horizon && e.location;
  });
  const { found, lookups, missing } = await locateVenues(
    current.map((e) => ({ location: e.location as string, venue: e.venue })),
    cache,
    config.now,
  );
  const events: NormalizedEvent[] = [];
  let skipped = raw.length - current.length;
  for (const event of current) {
    const coords = found.get(venueKey(event.location as string));
    const normalized = coords ? normalizeTorevent(event, coords, config) : null;
    if (normalized) events.push(normalized);
    else skipped++;
  }
  return { source: "torevent", events: mergePerformances(events, config), fetched: raw.length, skipped, lookups, unplaced: missing };
}
