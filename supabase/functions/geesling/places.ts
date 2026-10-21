// Google Places API (New) — Text Search.
// https://developers.google.com/maps/documentation/places/web-service/text-search

export interface PlaceItem {
  kind: "place";
  id: string;
  name: string;
  primary_type: string | null;
  types: string[];
  address: string | null;
  lat: number;
  lng: number;
  price_level: string | null;
  /** Google's per-person price range in CAD, when listed. `price_to` is null for open-ended ranges ("$100+"). */
  price_from: number | null;
  price_to: number | null;
  is_free: boolean;
  involves_alcohol: boolean;
  rating: number | null;
  rating_count: number | null;
  website: string | null;
  maps_url: string | null;
  summary: string | null;
  open_now: boolean | null;
  hours: string[] | null;
  /** Transient review evidence for recommendation quality; never cached or saved with walks. */
  review_evidence?: Array<{ rating: number; text: string; published: string | null; author: string | null; url: string | null }>;
}

interface GoogleReview {
  rating?: number;
  text?: { text?: string };
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName?: string; uri?: string };
  googleMapsUri?: string;
}

interface GoogleMoney {
  currencyCode?: string;
  units?: string;
  nanos?: number;
}

/** A Google Money value in CAD, or null when missing or in another currency. */
function cad(money: GoogleMoney | undefined): number | null {
  if (!money || money.currencyCode !== "CAD" || money.units === undefined) return null;
  const value = Number(money.units) + (money.nanos ?? 0) / 1e9;
  return Number.isFinite(value) ? value : null;
}

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  priceLevel?: string;
  priceRange?: { startPrice?: GoogleMoney; endPrice?: GoogleMoney };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  googleMapsUri?: string;
  editorialSummary?: { text?: string };
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  reviews?: GoogleReview[];
  businessStatus?: string;
}

const BASE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.priceLevel",
  "places.priceRange",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.editorialSummary",
  "places.currentOpeningHours",
  "places.regularOpeningHours",
  "places.businessStatus",
];

const FOOD_QUERY = /\b(food|restaurant|dessert|bakery|cafe|coffee|tea|bubble tea|ice cream|gelato|donut|doughnut|pastry|cake|chocolate|brunch|lunch|dinner|snack|eat|taco|pizza|ramen|noodle|dumpling|sushi|burger|shawarma|boba)\b/i;

const FREE_TYPES = new Set([
  "park", "city_park", "national_park", "state_park", "dog_park", "playground", "hiking_area", "beach",
  "plaza", "library", "church", "place_of_worship", "monument", "historical_landmark", "cultural_landmark",
  "botanical_garden", "garden", "observation_deck", "city_hall", "picnic_ground", "marina", "public_bath",
]);

const ALCOHOL_TYPES = new Set([
  "bar", "pub", "night_club", "wine_bar", "brewery", "brewpub", "cocktail_bar", "lounge_bar", "sports_bar",
  "beer_garden", "irish_pub", "winery", "bar_and_grill", "hookah_bar", "karaoke", "distillery",
]);

const PRICE_LEVELS = ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"];

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

function localQualityScore(place: PlaceItem, near: { lat: number; lng: number }, radiusMeters: number): number {
  const ratingEvidence = place.rating === null ? 0 : place.rating * 1.2;
  const reviewEvidence = place.rating_count === null ? 0 : Math.min(Math.log10(place.rating_count + 1), 4) * 0.55;
  const distancePenalty = Math.min(distanceMeters(near, place) / Math.max(radiusMeters, 1), 1) * 1.25;
  return ratingEvidence + reviewEvidence - distancePenalty;
}

export type MaxPrice = "inexpensive" | "moderate" | "expensive" | "any";

export interface PlaceSearch {
  query: string;
  near: { lat: number; lng: number };
  radiusMeters: number;
  maxPrice: MaxPrice;
  openNow: boolean;
  limit: number;
}

export function toPlaceItem(p: GooglePlace): PlaceItem | null {
  if (!p.location || !p.displayName?.text) return null;
  if (p.businessStatus && p.businessStatus !== "OPERATIONAL") return null;
  const types = p.types ?? [];
  const hours = p.currentOpeningHours ?? p.regularOpeningHours;
  return {
    kind: "place",
    id: p.id,
    name: p.displayName.text,
    primary_type: p.primaryType ?? null,
    types,
    address: p.formattedAddress ?? null,
    lat: p.location.latitude,
    lng: p.location.longitude,
    price_level: p.priceLevel ?? null,
    price_from: cad(p.priceRange?.startPrice),
    price_to: cad(p.priceRange?.endPrice),
    is_free: p.priceLevel === "PRICE_LEVEL_FREE" || (!p.priceLevel && types.some((t) => FREE_TYPES.has(t))),
    involves_alcohol: types.some((t) => ALCOHOL_TYPES.has(t)),
    rating: p.rating ?? null,
    rating_count: p.userRatingCount ?? null,
    website: p.websiteUri ?? null,
    maps_url: p.googleMapsUri ?? null,
    summary: p.editorialSummary?.text ?? null,
    open_now: hours?.openNow ?? null,
    hours: hours?.weekdayDescriptions ?? null,
    review_evidence: p.reviews?.slice(0, 2).flatMap((review) => {
      const snippet = review.text?.text?.trim();
      if (!snippet || typeof review.rating !== "number") return [];
      return [{
        rating: review.rating,
        text: snippet.slice(0, 220),
        published: review.relativePublishTimeDescription ?? null,
        author: review.authorAttribution?.displayName ?? null,
        url: review.googleMapsUri ?? null,
      }];
    }),
  };
}

export async function searchPlaces(apiKey: string, search: PlaceSearch): Promise<PlaceItem[]> {
  const body: Record<string, unknown> = {
    textQuery: /toronto/i.test(search.query) ? search.query : `${search.query} in Toronto`,
    pageSize: Math.min(Math.max(search.limit, 1), 20),
    locationBias: {
      circle: { center: { latitude: search.near.lat, longitude: search.near.lng }, radius: Math.min(search.radiusMeters, 50_000) },
    },
    languageCode: "en",
    regionCode: "CA",
  };
  if (search.openNow) body.openNow = true;
  const fieldMask = [...BASE_FIELD_MASK, ...(FOOD_QUERY.test(search.query) ? ["places.reviews"] : [])].join(",");
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Places search failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { places?: GooglePlace[] };
  const items = (data.places ?? [])
    .map(toPlaceItem)
    .filter((p): p is PlaceItem => p !== null)
    .sort((a, b) => localQualityScore(b, search.near, search.radiusMeters) - localQualityScore(a, search.near, search.radiusMeters));
  if (search.maxPrice === "any") return items;
  // Filter here rather than with the API's priceLevels, which drops places with no price
  // info (parks, markets, libraries) — exactly the free spots a budget walk wants.
  const cutoff = { inexpensive: 1, moderate: 2, expensive: 3 }[search.maxPrice];
  return items.filter((p) => {
    if (!p.price_level || p.price_level === "PRICE_LEVEL_FREE" || p.price_level === "PRICE_LEVEL_UNSPECIFIED") return true;
    const index = PRICE_LEVELS.indexOf(p.price_level);
    return index === -1 || index < cutoff;
  });
}
