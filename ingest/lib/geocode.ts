// Venue addresses → coordinates, for sources that list an address but no map position (torevent.ca).
// Each address is looked up once with OpenStreetMap's Nominatim and kept in public.venue_locations, so later runs
// only look up venues they haven't seen. Nominatim's usage policy: at most one request a second, a User-Agent that
// names the app, and results cached: https://operations.osmfoundation.org/policies/nominatim/
import { isInToronto } from "./classify.ts";

export interface VenueLocation {
  key: string;
  lat: number | null; // null = looked up and not found
  lng: number | null;
  looked_up_at: string;
}

export interface VenueCache {
  get(key: string): VenueLocation | undefined;
  /** Remembers a lookup; the runner saves new ones to the database at the end. */
  set(location: VenueLocation): void;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Geesling/1.0 (+https://geesling.ca; Toronto events map)";
// A failed lookup is tried again after this long, in case OpenStreetMap has gained the address.
const RETRY_MISS_DAYS = 14;

/** The cache key for a venue: its location text, tidied. */
export function venueKey(location: string): string {
  return location.toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();
}

/**
 * Searches to try for a listing's location, best first. torevent writes "Venue,123 Street, Toronto, ON M5V 1A1,
 * Canada": the street address alone finds most venues; the venue's name finds the rest.
 */
export function addressQueries(location: string, venue: string | null): string[] {
  // Web links and the country add nothing to a search.
  const parts = location.split(",").map((p) => p.trim()).filter((p) => p && !/^https?:\/\//i.test(p) && !/^canada$/i.test(p));
  const startsWithVenue = venue && parts[0]?.toLowerCase() === venue.trim().toLowerCase();
  const rest = startsWithVenue ? parts.slice(1) : parts;
  // A building name can sit before the street ("Jane Mallett Theatre, Toronto Centre for the Arts, 27 Front St E"):
  // the address starts at the first part with a street number.
  const firstNumber = rest.findIndex((p) => /^\d/.test(p));
  const street = (firstNumber > 0 ? rest.slice(firstNumber) : rest).join(", ");
  // OpenStreetMap rarely knows unit numbers: "1411 Dufferin St Unit B" is found as "1411 Dufferin St".
  const noUnit = street.replace(/\s*[,#]?\s*\b(unit|suite|ste|floor|fl|room|rm)\.?\s*[\w-]+/gi, "").replace(/\s+#\s*[\w-]+/g, "");
  // Some addresses are only found without the postal code and province: "178 Victoria St, Toronto".
  const [first, city] = noUnit.split(",").map((p) => p.trim());
  const short = first && city && /^\d/.test(first) ? `${first}, ${city.replace(/\s+on\b.*$/i, "")}` : null;
  const queries = [street, noUnit, short, venue ? `${venue}, Toronto` : null].filter((q): q is string => Boolean(q && /\d|toronto/i.test(q)));
  return [...new Set(queries)];
}

async function nominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    countrycodes: "ca",
    // Toronto and a little around it; bounded keeps a same-named street elsewhere in Canada out.
    viewbox: "-79.70,43.92,-79.05,43.55",
    bounded: "1",
  });
  const response = await fetch(`${NOMINATIM}?${params}`, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" } });
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
  const rows = (await response.json()) as Array<{ lat: string; lon: string }>;
  const lat = Number(rows[0]?.lat);
  const lng = Number(rows[0]?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) && isInToronto(lat, lng) ? { lat, lng } : null;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Coordinates for each location, from the cache or Nominatim (one request a second). `maxLookups` caps new
 * lookups per run so a burst of new venues can't stall the import; the rest are looked up next run.
 */
export async function locateVenues(
  venues: Array<{ location: string; venue: string | null }>,
  cache: VenueCache,
  now: Date,
  maxLookups = 400,
): Promise<{ found: Map<string, { lat: number; lng: number }>; lookups: number; missing: number }> {
  const found = new Map<string, { lat: number; lng: number }>();
  let lookups = 0;
  let missing = 0;
  const retryBefore = now.getTime() - RETRY_MISS_DAYS * 86_400_000;
  const seen = new Set<string>();
  for (const { location, venue } of venues) {
    const key = venueKey(location);
    if (seen.has(key)) continue;
    seen.add(key);
    const cached = cache.get(key);
    if (cached?.lat != null && cached.lng != null) {
      found.set(key, { lat: cached.lat, lng: cached.lng });
      continue;
    }
    if ((cached && Date.parse(cached.looked_up_at) > retryBefore) || lookups >= maxLookups) {
      missing++;
      continue;
    }
    let hit: { lat: number; lng: number } | null = null;
    for (const query of addressQueries(location, venue)) {
      if (lookups > 0) await pause(1100);
      lookups++;
      hit = await nominatim(query);
      if (hit) break;
    }
    cache.set({ key, lat: hit?.lat ?? null, lng: hit?.lng ?? null, looked_up_at: now.toISOString() });
    if (hit) found.set(key, hit);
    else missing++;
  }
  return { found, lookups, missing };
}

/** A cache held in memory, filled from the database (or empty on a dry run); `fresh` lists what this run added. */
export function memoryCache(rows: VenueLocation[]): VenueCache & { fresh: VenueLocation[] } {
  const map = new Map(rows.map((r) => [r.key, r]));
  const fresh: VenueLocation[] = [];
  return {
    fresh,
    get: (key) => map.get(key),
    set: (location) => {
      map.set(location.key, location);
      fresh.push(location);
    },
  };
}
