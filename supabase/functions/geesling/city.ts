// City of Toronto open data spots for the guide (table city_spots, filled by ingest/city-spots.ts).
// Pure with type-only imports (tests/city.test.ts). Free to search, unlike Google Places.
import type { PlaceItem } from "./places.ts";

export type CityKind = "art" | "landmark" | "stroll" | "culture" | "music_venue" | "water" | "patio" | "fall_colours";
export const CITY_KINDS: CityKind[] = ["art", "landmark", "stroll", "culture", "music_venue", "water", "patio", "fall_colours"];

export interface CitySpotRow {
  id: string;
  source: string;
  kind: CityKind;
  name: string;
  description: string | null;
  address: string | null;
  lat: number;
  lng: number;
  website: string | null;
  image_url: string | null;
  details: Record<string, unknown> | null;
  distance_m?: number | null;
}

// Things you look at or walk past are free; a café patio or a music venue costs whatever you order or the ticket.
const FREE: CityKind[] = ["art", "landmark", "stroll", "culture", "water", "fall_colours"];

const LABEL: Record<CityKind, string> = {
  art: "public art",
  landmark: "landmark",
  stroll: "StrollTO point of interest",
  culture: "Cultural Hotspot site",
  music_venue: "music venue",
  water: "drinking water",
  patio: "CaféTO patio",
  fall_colours: "fall colours street",
};

/** A city spot in the same shape as a Google place, so routes, the map and saving treat it the same. */
export function citySpotToPlace(row: CitySpotRow): PlaceItem {
  return {
    kind: "place",
    id: `city:${row.id}`,
    name: row.name,
    primary_type: LABEL[row.kind],
    types: [row.kind],
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    price_level: null,
    price_from: null,
    price_to: null,
    // Museums and stadiums charge entry; the City lists no prices, so only those categories count as paid.
    is_free: FREE.includes(row.kind) && !/museum|sports/i.test(String(row.details?.category ?? "")),
    involves_alcohol: false,
    rating: null,
    rating_count: null,
    website: row.website,
    maps_url: null,
    summary: row.description,
    open_now: null,
    hours: null,
    source: "city",
    city_kind: row.kind,
    image_url: row.image_url,
  };
}

/** What the model sees for a city spot: no ratings (the City doesn't rate), but a short description and extras. */
export function cityForModel(p: PlaceItem, row: CitySpotRow) {
  const details = Object.fromEntries(Object.entries(row.details ?? {}).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)));
  return {
    id: p.id,
    name: p.name,
    kind: row.kind,
    type: p.primary_type,
    lat: Number(p.lat.toFixed(5)),
    lng: Number(p.lng.toFixed(5)),
    address: p.address,
    is_free: p.is_free,
    price_per_person: p.is_free ? "free" : "not listed",
    description: row.description ? row.description.slice(0, 280) : null,
    details,
    distance_m: row.distance_m == null ? null : Math.round(row.distance_m),
  };
}

/** Drinking water that the City has switched off (most fountains are off for winter) is no use on a route. */
export function usableCitySpot(row: CitySpotRow): boolean {
  return row.kind !== "water" || row.details?.working === true;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\b(the|cafe|restaurant|bar|inc|ltd)\b/g, " ").replace(/\s+/g, " ").trim();

/** "123 Queen St W, Toronto, ON" → "123 queen". The street number and first word of the street name. */
function addressKey(address: string | null | undefined): string | null {
  const m = norm(address).match(/^(\d+)\s+([a-z]+)/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/**
 * Whether a Google place has a CaféTO patio: a patio licence within about 60 m with the same street address,
 * or the same business name. Patio names are licence operators, so a name match alone needs to be close too.
 */
export function hasPatio(place: { name: string; address: string | null; lat: number; lng: number }, patios: Array<{ name: string; address: string | null; lat: number; lng: number }>): boolean {
  const key = addressKey(place.address);
  const name = norm(place.name);
  return patios.some((p) => {
    const metres = Math.hypot((p.lat - place.lat) * 111_000, (p.lng - place.lng) * 80_500);
    if (metres > 60) return false;
    const patioName = norm(p.name);
    return (key !== null && key === addressKey(p.address)) || (name.length >= 3 && patioName.length >= 3 && (patioName.includes(name) || name.includes(patioName)));
  });
}

/** Fall colours are worth a stop from about September 20 to November 15 in Toronto. */
export function isFallColourSeason(now: Date): boolean {
  const [month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "numeric", day: "numeric" })
    .formatToParts(now)
    .filter((p) => p.type === "month" || p.type === "day")
    .map((p) => Number(p.value));
  return (month === 9 && day >= 20) || month === 10 || (month === 11 && day <= 15);
}

/** Leaves don't show after dark. In fall Toronto is dark by about 6 pm, so 6 pm to 7 am counts as dark. */
export function tooDarkForLeaves(start: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(start));
  return hour >= 18 || hour < 7;
}
