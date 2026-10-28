// City of Toronto open data → city_spots rows. Pure (tests/citySpots.test.ts); ingest/city-spots.ts fetches and saves.
// Licence: Open Government Licence – Toronto (attribution shown in the app).
import { webUrl } from "./url.ts";

export type CitySpotKind = "art" | "landmark" | "stroll" | "culture" | "music_venue" | "water" | "patio" | "fall_colours";

export interface CitySpot {
  id: string;
  source: string;
  kind: CitySpotKind;
  name: string;
  description: string | null;
  address: string | null;
  lat: number;
  lng: number;
  website: string | null;
  image_url: string | null;
  details: Record<string, unknown>;
}

export type Row = Record<string, unknown>;

/** The portal writes missing values as the string "None". */
export function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s && s !== "None" && s !== "null" ? s : null;
}

/** [lng, lat] from a GeoJSON Point/MultiPoint string or object, or explicit lat/lng columns. Null outside Toronto. */
export function point(row: Row, latKey?: string, lngKey?: string): { lat: number; lng: number } | null {
  let lat = latKey ? Number(row[latKey]) : NaN;
  let lng = lngKey ? Number(row[lngKey]) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    try {
      const g = typeof row.geometry === "string" ? JSON.parse(row.geometry) : row.geometry;
      const c = g?.type === "Point" ? g.coordinates : g?.type === "MultiPoint" ? g.coordinates?.[0] : null;
      if (c) [lng, lat] = [Number(c[0]), Number(c[1])];
    } catch {
      return null;
    }
  }
  // Toronto's bounding box, generously: anything else is a bad record.
  if (!(lat > 43.5 && lat < 43.9 && lng > -79.7 && lng < -79.0)) return null;
  return { lat, lng };
}

/** "99 BOTTLES" → "99 Bottles", "KINGSTON RD" → "Kingston Rd". Leaves mixed-case text alone. */
export function titleCase(value: string | null): string | null {
  if (!value || value !== value.toUpperCase()) return value;
  return value.toLowerCase().replace(/(^|[\s\-'/(&.])([a-z])/g, (_, before: string, ch: string) => before + ch.toUpperCase());
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

function spot(base: Omit<CitySpot, "lat" | "lng" | "website" | "image_url"> & { website?: unknown; image_url?: unknown }, at: { lat: number; lng: number } | null): CitySpot | null {
  if (!at || !base.name) return null;
  return { ...base, ...at, website: webUrl(text(base.website)), image_url: webUrl(text(base.image_url)) };
}

export function publicArt(row: Row): CitySpot | null {
  const title = text(row.TITLE);
  const artist = text(row.ARTIST);
  const bits = [text(row.ARTWORK_TYPE), text(row.MEDIUM), text(row.YEAR)].filter(Boolean).join(", ");
  return spot({
    id: `public-art:${text(row.FID) ?? slug(`${title}-${text(row.ADDRESS)}`)}`,
    source: "public-art",
    kind: "art",
    name: title ?? "",
    description: [artist ? `By ${artist}.` : null, bits ? `${bits}.` : null, text(row.DESCRIPTION)].filter(Boolean).join(" ") || null,
    address: text(row.ADDRESS),
    website: row.ARTIST_WEBSITE,
    image_url: row.IMAGE_URL ?? row.THUMB_URL,
    details: { artist, program: text(row.PROGRAM), year: text(row.YEAR) },
  }, point(row, "LATITUDE", "LONGITUDE"));
}

export function strollTo(row: Row): CitySpot | null {
  const title = text(row.Title);
  const neighbourhood = text(row.Neighbourhood);
  return spot({
    id: `strollto:${slug(`${neighbourhood}-${title}-${text(row.Address)}`)}`,
    source: "strollto",
    kind: "stroll",
    name: title ?? "",
    description: text(row.Description),
    address: text(row.Address),
    website: row.Link_URL,
    image_url: row.IMAGE_URL,
    details: { neighbourhood, accessibility: text(row.Accessibility), bia: text(row.BIA) },
  }, point(row));
}

export function culturalHotspot(row: Row): CitySpot | null {
  const name = text(row.SiteName);
  return spot({
    id: `cultural-hotspot:${slug(`${text(row.LoopTourID)}-${text(row.OrderNum) ?? "0"}-${name}`)}`,
    source: "cultural-hotspot",
    kind: "culture",
    name: name ?? "",
    description: text(row.Description),
    address: text(row.Address),
    website: row.LoopTourURL,
    image_url: null,
    details: { tour: text(row.LoopTourName), interests: text(row.Interests), duration: text(row.Duration), neighbourhood: text(row.Neighbourhood) },
  }, point(row, "Latitude", "Longitude"));
}

export function placeOfInterest(row: Row): CitySpot | null {
  const name = text(row.NAME);
  const category = text(row.CATEGORY);
  // Visitor centres, convention centres and transit hubs aren't outing stops.
  if (category && /visitor information|convention|transportation/i.test(category)) return null;
  return spot({
    id: `places-of-interest:${text(row.GEOID) ?? slug(`${name}-${text(row.ADDRESS_FULL)}`)}`,
    source: "places-of-interest",
    kind: "landmark",
    name: name ?? "",
    description: category,
    address: text(row.ADDRESS_FULL) ?? text(row.ADDRESS_INFO),
    website: row.WEBSITE,
    image_url: null,
    details: { category },
  }, point(row));
}

export function musicVenue(row: Row): CitySpot | null {
  const name = text(row.NAME);
  const capacity = Number(text(row.CAPACITY));
  const category = text(row.CATEGORY);
  return spot({
    id: `music-venues:${slug(`${name}-${text(row.ADDRESS)}`)}`,
    source: "music-venues",
    kind: "music_venue",
    name: name ?? "",
    description: [category, Number.isFinite(capacity) && capacity > 0 ? `holds about ${capacity}` : null].filter(Boolean).join(", ") || null,
    address: text(row.ADDRESS),
    website: row.WEBSITE,
    image_url: null,
    details: { category, capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null },
  }, point(row));
}

export function drinkingWater(row: Row): CitySpot | null {
  const where = text(row.LOCATION);
  const type = text(row.TYPE);
  // Status 1 = on; 0 = off (most are shut off for winter). Dog-only fountains aren't for people.
  if (type && /^dog fountain$/i.test(type)) return null;
  return spot({
    id: `drinking-water:${text(row.ASSET_ID) ?? slug(`${where}-${text(row.ALTERNATIVE_NAME)}`)}`,
    source: "parks-drinking-fountains",
    kind: "water",
    name: text(row.ALTERNATIVE_NAME) ?? `${where ?? "Park"} drinking water`,
    description: [type, text(row.LOCATION_DETAILS)].filter(Boolean).join(". ") || null,
    address: text(row.ADDRESS),
    website: row.URL,
    image_url: null,
    details: { working: String(row.Status) === "1", reason: text(row.Reason), park: where, type },
  }, point(row));
}

export function cafeTo(row: Row): CitySpot | null {
  const name = titleCase(text(row.OPERATOR_NAME));
  const address = titleCase(text(row.BUSINESS_ADDRESS) ?? text(row.MUNICIPAL_ADDRESS));
  return spot({
    id: `cafeto:${text(row.LICENCE_NUMBER) ? slug(`${text(row.LICENCE_NUMBER)}-${text(row.INTERVENTION_TYPE)}`) : slug(`${name}-${address}`)}`,
    source: "cafeto",
    kind: "patio",
    name: name ?? "",
    description: text(row.INTERVENTION_TYPE) ?? text(row.CATEGORY),
    address,
    image_url: null,
    details: { type: text(row.INTERVENTION_TYPE) ?? text(row.CATEGORY), bia: titleCase(text(row.BIA_NAME)) },
  }, point(row));
}

// Street trees that turn red, orange or gold in the fall (Norway maples mostly stay green or go dull yellow).
export function isFallColourTree(commonName: string | null): boolean {
  if (!commonName) return false;
  return /^(maple|oak|ginkgo|sweetgum|sumac|serviceberry|tupelo|katsura|dogwood|redbud|ironwood|sassafras|tulip)/i.test(commonName)
    && !/norway|crimson king|manitoba/i.test(commonName);
}

export interface Tree {
  lat: number;
  lng: number;
  street: string | null;
  crossStreet?: string | null;
  species: string | null;
  trunkCm: number | null;
}

const CELL_LAT = 0.0015; // ~165 m
const CELL_LNG = 0.002; // ~160 m

/**
 * The blocks with the most colour-turning street trees, as fall_colours spots. Bigger trunks count for more
 * (a mature maple is a bigger show), up to a cap so one giant doesn't make a block.
 */
export function fallColourBlocks(trees: Tree[], limit = 200, minTrees = 25): CitySpot[] {
  const cells = new Map<string, { trees: Tree[]; score: number }>();
  for (const t of trees) {
    const key = `${Math.floor(t.lat / CELL_LAT)}:${Math.floor(t.lng / CELL_LNG)}`;
    const cell = cells.get(key) ?? { trees: [], score: 0 };
    cell.trees.push(t);
    cell.score += Math.min(Math.max(t.trunkCm ?? 10, 5), 60);
    cells.set(key, cell);
  }
  const count = <T>(items: T[]) => {
    const m = new Map<T, number>();
    for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  return [...cells.entries()]
    .filter(([, c]) => c.trees.length >= minTrees)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([key, c]) => {
      const lat = c.trees.reduce((s, t) => s + t.lat, 0) / c.trees.length;
      const lng = c.trees.reduce((s, t) => s + t.lng, 0) / c.trees.length;
      const street = count(c.trees.map((t) => t.street).filter((s): s is string => !!s))[0]?.[0] ?? null;
      const cross = count(c.trees.map((t) => t.crossStreet).filter((s): s is string => !!s && s !== street))[0]?.[0] ?? null;
      const streetName = titleCase(street);
      const crossName = titleCase(cross);
      const plural = (k: string) => (k.endsWith("y") ? `${k.slice(0, -1)}ies` : `${k}s`);
      const kinds = count(c.trees.map((t) => (t.species ?? "").split(",")[0].trim().toLowerCase()).filter(Boolean)).slice(0, 3).map(([k]) => plural(k));
      return {
        id: `fall-colours:${key}`,
        source: "street-tree-data",
        kind: "fall_colours" as const,
        name: streetName ? `Fall colours on ${streetName}${crossName ? ` near ${crossName}` : ""}` : "Fall colours block",
        description: `About ${c.trees.length} colour-turning street trees on this block, mostly ${kinds.join(", ")}. Best from late September to early November.`,
        address: streetName && crossName ? `${streetName} at ${crossName}` : streetName,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        website: null,
        image_url: null,
        details: { trees: c.trees.length, species: kinds },
      };
    });
}
