import type { Category, NormalizedEvent } from "./types.ts";

/** Source category labels (lowercased) → Geesling categories. */
const LABEL_MAP: Record<string, Category[]> = {
  // City of Toronto
  "arts/exhibits": ["arts_culture", "gallery"],
  "live performances": ["arts_culture"],
  museum: ["arts_culture"],
  cultural: ["arts_culture"],
  "family/children": ["family"],
  music: ["music"],
  history: ["arts_culture"],
  theatre: ["theatre"],
  "food/culinary": ["food_drink"],
  artisan: ["market", "arts_culture"],
  tour: ["outdoors", "community"],
  "farmers' market": ["market", "food_drink"],
  "farmers market": ["market", "food_drink"],
  environmental: ["outdoors"],
  sports: ["sports"],
  celebrations: ["festival"],
  comedy: ["comedy"],
  "seminars/workshops": ["workshop"],
  dance: ["arts_culture", "music"],
  nightlife: ["nightlife"],
  film: ["film"],
  indigenous: ["arts_culture", "community"],
  "charity/cause": ["community"],
  "2slgbtq+": ["community"],
  "lgbtq2s+": ["community"],
  "public square": ["community", "outdoors"],
  talks: ["workshop"],
  "street festival": ["festival", "food_drink"],
  "run/walk": ["sports", "outdoors"],
  literary: ["arts_culture"],
  trivia: ["nightlife", "community"],
  "world culture": ["arts_culture"],
  parade: ["festival"],
  cycling: ["sports", "outdoors"],
  "consumer show/convention": ["market"],
  // Ticketmaster segments/genres
  "arts & theatre": ["theatre", "arts_culture"],
  "arts &amp; theatre": ["theatre", "arts_culture"],
  "fine art": ["gallery", "arts_culture"],
  "film & tv": ["film"],
  miscellaneous: ["community"],
  "hip-hop/rap": ["music"],
  "dance/electronic": ["music", "nightlife"],
  rock: ["music"],
  pop: ["music"],
  jazz: ["music"],
  "r&b": ["music"],
  country: ["music"],
  classical: ["music", "arts_culture"],
  "food & drink": ["food_drink"],
  // Eventbrite categories (short_name)
  "film & media": ["film"],
  "performing & visual arts": ["arts_culture", "gallery"],
  "food & drink ": ["food_drink"],
  community: ["community"],
  "community & culture": ["community", "arts_culture"],
  "charity & causes": ["community"],
  "hobbies & special interest": ["workshop"],
  "hobbies": ["workshop"],
  "science & technology": ["workshop"],
  "science & tech": ["workshop"],
  "seasonal & holiday": ["festival"],
  seasonal: ["festival"],
  "sports & fitness": ["sports"],
  "travel & outdoor": ["outdoors"],
  "family & education": ["family", "workshop"],
  "fashion & beauty": ["market"],
  fashion: ["market"],
  "home & lifestyle": ["workshop"],
  "health & wellness": ["sports"],
  health: ["sports"],
  "business & professional": ["workshop"],
  business: ["workshop"],
};

const KEYWORD_RULES: Array<[RegExp, Category]> = [
  [/\b(concert|live music|dj set|band|orchestra|symphony|choir|open mic|jazz|hip.?hop|album release)\b/i, "music"],
  [/\b(club night|nightclub|rave|afterparty|after party|dance party|drag show|cabaret)\b/i, "nightlife"],
  [/\b(gallery|exhibition|exhibit|vernissage|opening reception|art show)\b/i, "gallery"],
  [/\b(screening|film festival|cinema|movie night|premiere|documentary)\b/i, "film"],
  [/\b(food|tasting|brunch|dinner|chef|culinary|dessert|bakery|night market|food truck)\b/i, "food_drink"],
  [/\b(market|bazaar|flea|thrift|vintage sale|craft fair|pop.?up shop|artisan)\b/i, "market"],
  [/\b(festival|fest|carnival|parade|celebration)\b/i, "festival"],
  [/\b(comedy|stand.?up|improv|sketch show)\b/i, "comedy"],
  [/\b(theatre|theater|musical|play|opera|ballet)\b/i, "theatre"],
  [/\b(workshop|class|lecture|talk|panel|masterclass|seminar)\b/i, "workshop"],
  [/\b(hike|walking tour|park|outdoor|garden|beach|ravine|island)\b/i, "outdoors"],
];

const ALCOHOL_PATTERN =
  /\b(cash bar|full bar|bar service|licensed bar|wine bar|cocktail bar|at the bar|pub|brewery|brewpub|taproom|beer|craft beer|wine|winery|cocktail|cocktails|mixology|happy hour|booze|boozy|whisky|whiskey|bourbon|tequila|mezcal|distillery|hard cider|lcbo|licensed event|open bar|bottomless mimosas|mimosa|drinks? specials?|bar crawl|pub crawl|beer garden|wine tasting|nightclub|club night|19\+|19 and over|ages 19)\b/i;

const RSVP_PATTERN =
  /\b(rsvp|registration required|register in advance|pre.?register|book (online )?in advance|advance (booking|registration|tickets?)|tickets? (must|are) (be )?(booked|reserved)|reservations? (required|recommended)|sign.?up required|limited capacity|must register)\b/i;

export function mapLabels(labels: Array<string | null | undefined>): Category[] {
  const out = new Set<Category>();
  for (const label of labels) {
    if (!label) continue;
    const key = label.trim().toLowerCase();
    for (const cat of LABEL_MAP[key] ?? []) out.add(cat);
  }
  return [...out];
}

/**
 * Adds keyword-derived categories. When the source already labelled the event, only the
 * title is scanned (descriptions mention "park", "talk", "play" far too loosely).
 */
export function inferCategories(title: string, description: string | null, existing: Category[]): Category[] {
  const out = new Set<Category>(existing);
  const text = existing.length > 0 ? title : `${title}\n${description ?? ""}`;
  for (const [pattern, cat] of KEYWORD_RULES) {
    if (pattern.test(text)) out.add(cat);
  }
  if (out.size === 0) out.add("community");
  return [...out].slice(0, 4);
}

export function detectAlcohol(text: string, ageMin: number | null, categories: Category[]): boolean {
  if (ageMin !== null && ageMin >= 19) return true;
  // "Nightlife" alone is not enough (escape rooms, scavenger hunts) unless it's a bar/club setting.
  if (categories.includes("nightlife") && /\b(bar|club|lounge|dj)\b/i.test(text)) return true;
  return ALCOHOL_PATTERN.test(text);
}

export function detectRsvp(text: string): boolean {
  return RSVP_PATTERN.test(text);
}

export function stripHtml(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return text.length > 0 ? text.slice(0, 4000) : null;
}

/** Source trust: official/ticketing systems of record first. */
export const SOURCE_PRIORITY: Record<NormalizedEvent["source"], number> = {
  toronto: 30,
  ticketmaster: 25,
  eventbrite: 20,
};

/** Completeness score (0–100) used to pick the single most accurate record among duplicates. */
export function qualityScore(e: Omit<NormalizedEvent, "quality_score">, endsKnown: boolean): number {
  let score = SOURCE_PRIORITY[e.source];
  if (e.description && e.description.length > 80) score += 12;
  if (e.image_url) score += 8;
  if (e.venue_name) score += 6;
  if (e.address) score += 6;
  if (e.is_free || e.price_min !== null) score += 12;
  if (e.url || e.ticket_url) score += 8;
  if (endsKnown) score += 8;
  return Math.min(100, score);
}

export function isInToronto(lat: number, lng: number): boolean {
  // Greater Toronto bounding box (Mississauga → Pickering, lakeshore → Vaughan)
  return lat > 43.4 && lat < 44.0 && lng > -79.9 && lng < -79.0;
}
