// What each daily email features, and its words. Pure (tests/dailyEmails.test.ts); index.ts fetches the data.
import type { EmailContent, EmailItem } from "./template.ts";

export type EmailKind = "morning" | "neighbourhood" | "evening";

export interface EventRow {
  title: string;
  venue_name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  is_free: boolean;
  price_min: number | null;
  categories: string[];
  quality_score: number;
  schedule: Array<{ start: string; end: string }>;
}

export interface SpotRow {
  kind: string;
  name: string;
  address: string | null;
}

export interface PlaceRow {
  name: string;
  address: string;
  rating: number;
  reviews: number;
  /** Google's price range per person, e.g. [10, 20]; null when Google doesn't give one. */
  price: [number, number] | null;
  kindLabel: string;
}

export interface Area {
  name: string;
  lat: number;
  lng: number;
  /** One line about the area, for the neighbourhood email's banner. */
  blurb: string;
}

// Neighbourhood days rotate through these. Each covers roughly 1.8 km × 1.8 km around its centre.
export const NEIGHBOURHOODS: Area[] = [
  { name: "Roncesvalles", lat: 43.6475, lng: -79.4495, blurb: "West end · leafy streets, indie cafés, High Park next door" },
  { name: "Kensington Market", lat: 43.6547, lng: -79.4006, blurb: "Downtown west · vintage shops, street food, live music" },
  { name: "Leslieville", lat: 43.6625, lng: -79.333, blurb: "East end · brunch spots, galleries, Jimmie Simpson Park" },
  { name: "The Annex", lat: 43.668, lng: -79.404, blurb: "Midtown west · bookshops, Bloor St eats, U of T campus" },
  { name: "Little Italy", lat: 43.6553, lng: -79.4146, blurb: "College St · patios, cafés, Trinity Bellwoods nearby" },
  { name: "The Danforth", lat: 43.678, lng: -79.349, blurb: "Greektown · souvlaki, bakeries, Withrow Park" },
  { name: "Distillery District", lat: 43.6503, lng: -79.3596, blurb: "Old Town · cobblestones, galleries, the waterfront" },
  { name: "The Junction", lat: 43.6655, lng: -79.47, blurb: "West end · vintage, coffee, the West Toronto Railpath" },
  { name: "Liberty Village", lat: 43.638, lng: -79.421, blurb: "West downtown · brick lofts, cafés, the waterfront trail" },
  { name: "Ossington", lat: 43.649, lng: -79.42, blurb: "Queen West · galleries, bars, Trinity Bellwoods Park" },
  { name: "Church–Wellesley", lat: 43.665, lng: -79.381, blurb: "The Village · galleries, cafés, Barbara Hall Park" },
  { name: "Yorkville", lat: 43.671, lng: -79.393, blurb: "Midtown · the ROM, galleries, Philosopher's Walk" },
  { name: "The Beaches", lat: 43.668, lng: -79.297, blurb: "East end · the boardwalk, Queen St E, the lake" },
  { name: "Chinatown", lat: 43.653, lng: -79.398, blurb: "Spadina · dumplings, bakeries, the AGO next door" },
  { name: "St. Lawrence", lat: 43.649, lng: -79.372, blurb: "Old Town · the market, Berczy Park, the Flatiron" },
  { name: "Bloor West Village", lat: 43.6505, lng: -79.484, blurb: "West end · bakeries, delis, High Park's west side" },
];

// The 5 pm food email rotates through these parts of town, so it isn't the same six spots every night.
export const EVENING_AREAS: Area[] = [
  { name: "downtown", lat: 43.6532, lng: -79.3832, blurb: "" },
  { name: "the west end", lat: 43.6475, lng: -79.42, blurb: "" },
  { name: "the east end", lat: 43.6625, lng: -79.338, blurb: "" },
  { name: "midtown", lat: 43.6707, lng: -79.3925, blurb: "" },
];

/** A box around an area, for "within this neighbourhood" searches. */
export function areaBox(a: Area, scale = 1): { south: number; north: number; west: number; east: number } {
  return { south: a.lat - 0.008 * scale, north: a.lat + 0.008 * scale, west: a.lng - 0.011 * scale, east: a.lng + 0.011 * scale };
}

export function inArea(a: Area, lat: number, lng: number): boolean {
  const b = areaBox(a);
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

// Listings that make a poor "go do this today" pick: programmes for kids or members, passes, drives, and events
// whose season has passed. Checked against the title (and categories for family-only).
const NOT_A_PICK =
  /\b(youth|kids?|children|toddler|teen|seniors?|program(me)?s?|registration|season pass|membership|candy drive|food drive|fundraiser|webinar|virtual|online|cancel+ed|postponed|sold out)\b/i;
const OUTSIDE_CITY = /\b(mississauga|brampton|vaughan|markham|richmond hill|pickering|ajax|oakville)\b/i;

function seasonOver(title: string, month: number): boolean {
  if (/halloween|trick.or.treat/i.test(title)) return month !== 10;
  if (/christmas|holiday market|santa/i.test(title)) return month < 11 && month !== 12;
  return false;
}

/** Worth suggesting at all: not a programme, pass, drive or out-of-season listing. */
export function worthPicking(title: string, month: number): boolean {
  return !NOT_A_PICK.test(title) && !seasonOver(title, month);
}

/** Inside the City of Toronto, roughly: a box, minus venues that name a neighbouring city. */
export function inToronto(e: Pick<EventRow, "lat" | "lng" | "venue_name" | "address">): boolean {
  if (e.lat < 43.58 || e.lat > 43.86 || e.lng < -79.64 || e.lng > -79.11) return false;
  return !OUTSIDE_CITY.test(`${e.venue_name ?? ""} ${e.address ?? ""}`);
}

/** The first session of the event that's on in [from, to), or null. */
export function sessionIn(e: EventRow, from: Date, to: Date): { start: Date; end: Date } | null {
  for (const s of e.schedule) {
    const start = new Date(s.start);
    const end = new Date(s.end);
    if (start < to && end > from) return { start, end };
  }
  return null;
}

const clock = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true })
    .format(d)
    .replace(":00", "")
    .replace(/\s?a\.m\./, " am")
    .replace(/\s?p\.m\./, " pm");

/** "until 6 pm" for something already on (or on all day), "7 pm" for a later start. */
export function whenLabel(session: { start: Date; end: Date }, now: Date): string {
  return session.start <= now ? `until ${clock(session.end)}` : clock(session.start);
}

/**
 * Today's free picks: free, in Toronto, on today, not a programme/pass/out-of-season listing, at most one per
 * category, best listings first. `month` is Toronto's month (1–12).
 */
export function pickFreeEvents(events: EventRow[], from: Date, to: Date, month: number, n = 4): Array<{ e: EventRow; when: { start: Date; end: Date } }> {
  const candidates = events
    .filter((e) => e.is_free && inToronto(e) && !NOT_A_PICK.test(e.title) && !seasonOver(e.title, month) && !(e.categories.length === 1 && e.categories[0] === "family"))
    .map((e) => ({ e, when: sessionIn(e, from, to) }))
    .filter((x): x is { e: EventRow; when: { start: Date; end: Date } } => x.when !== null)
    .sort((a, b) => b.e.quality_score - a.e.quality_score || a.when.start.getTime() - b.when.start.getTime());
  const out: typeof candidates = [];
  const usedCats = new Set<string>();
  const usedTitles = new Set<string>();
  // First pass: one per category. Second pass: if that left gaps, let categories repeat.
  for (const pass of [0, 1]) {
    for (const c of candidates) {
      if (out.length === n) break;
      const cat = c.e.categories[0] ?? "other";
      const key = c.e.title.toLowerCase().replace(/\W+/g, " ").trim();
      if (usedTitles.has(key) || (pass === 0 && usedCats.has(cat))) continue;
      usedCats.add(cat);
      usedTitles.add(key);
      out.push(c);
    }
  }
  return out;
}

const priceTag = (p: PlaceRow): EmailItem["tag"] => (p.price ? { text: `$${p.price[0]}–${p.price[1]}`, tone: "price" } : { text: "$", tone: "price" });
const placeDetail = (p: PlaceRow, withKind = false) =>
  `${p.address}${withKind && p.kindLabel ? ` · ${p.kindLabel}` : ""} · ${p.rating.toFixed(1)} stars (${p.reviews.toLocaleString("en-CA")} reviews)`;
const askUrl = (prompt: string, kind: EmailKind) => `https://geesling.ca/?ask=${encodeURIComponent(prompt)}&from=email-${kind}`;
const GOOGLE_CREDIT = "Café and restaurant ratings and prices from Google Maps";

export function composeMorning(args: { dateLabel: string; freeCount: number; picks: Array<{ e: EventRow; when: { start: Date; end: Date } }>; now: Date }): EmailContent {
  const { picks, freeCount, now } = args;
  const items: EmailItem[] = picks.map(({ e, when }) => ({
    title: e.title.trim(),
    detail: `${e.venue_name?.trim() || "Toronto"} · ${whenLabel(when, now)}`,
    tag: { text: "FREE", tone: "free" },
  }));
  const first = picks[0]?.e.title.trim();
  return {
    dateLabel: args.dateLabel,
    subject: `☀️ ${freeCount} free things on today in Toronto`,
    preheader: first ? `${first}, plus ${Math.max(freeCount - 1, 0)} more free picks. Your budget, your plan.` : "Free things to do in Toronto today.",
    intro: `Honk, good morning! ${freeCount} free things are on in Toronto today. Here ${items.length === 1 ? "is one" : `are ${items.length}`} worth leaving the house for:`,
    sections: [{ items }],
    cta: { label: "Plan my day", url: askUrl("Plan my day in Toronto today, mostly free things", "morning") },
    outro: "Got $20? Tell me and I'll fit in a coffee and a cheap bite.",
  };
}

/** "about $11–30" from the places' price ranges (low end of each, high end of each). */
export function spendRange(places: PlaceRow[], budget = 20): string | null {
  const priced = places.filter((p) => p.price);
  if (!priced.length) return null;
  const lo = priced.reduce((s, p) => s + p.price![0], 0);
  const hi = priced.reduce((s, p) => s + p.price![1], 0);
  if (hi <= budget) return `up to $${hi}`;
  return lo === hi ? `about $${lo}` : `about $${lo}–${hi}`;
}

export function composeNeighbourhood(args: {
  dateLabel: string;
  area: Area;
  budget: number;
  coffee: PlaceRow | null;
  lunch: PlaceRow | null;
  freeSpots: SpotRow[];
  freeEvents: Array<{ e: EventRow; when: { start: Date; end: Date } }>;
  extra: { e: EventRow; when: { start: Date; end: Date } } | null;
  now: Date;
}): EmailContent {
  const { area, coffee, lunch, now } = args;
  const steps: EmailItem[] = [];
  if (coffee) steps.push({ title: `Coffee at ${coffee.name}`, detail: placeDetail(coffee), tag: priceTag(coffee) });
  const free: EmailItem[] = [
    ...args.freeEvents.map(({ e, when }) => ({ title: e.title.trim(), detail: `${e.venue_name?.trim() || area.name} · ${whenLabel(when, now)}`, tag: { text: "FREE", tone: "free" as const } })),
    ...args.freeSpots.map((s) => ({ title: spotTitle(s), detail: s.address ?? area.name, tag: { text: "FREE", tone: "free" as const } })),
  ];
  if (free[0]) steps.push(free[0]);
  if (lunch) steps.push({ title: `Lunch at ${lunch.name}`, detail: placeDetail(lunch, true), tag: priceTag(lunch) });
  if (free[1]) steps.push(free[1]);
  if (args.extra) {
    const { e, when } = args.extra;
    steps.push({ title: e.title.trim(), detail: `${e.venue_name?.trim() || area.name} · ${whenLabel(when, now)} · if you want to end with this`, tag: { text: "TICKET EXTRA", tone: "extra" } });
  }
  steps.forEach((s, i) => (s.step = i + 1));
  const spend = spendRange([coffee, lunch].filter((p): p is PlaceRow => p !== null));
  return {
    dateLabel: args.dateLabel,
    subject: `🗺️ A day in ${area.name} under $${args.budget}`,
    preheader: `${[coffee && `coffee at ${coffee.name}`, free[0]?.title, lunch && `lunch at ${lunch.name}`].filter(Boolean).slice(0, 3).join(", ")}.`,
    hero: { title: `A day in ${area.name}`, subtitle: `Under $${args.budget} · ${area.blurb}` },
    intro: `Honk! Today's neighbourhood is ${area.name}. Here's a cheap day out:`,
    sections: [{ items: steps }],
    total: spend ? { label: lunch && coffee ? "Coffee + lunch," : "Spend,", value: spend } : undefined,
    attribution: coffee || lunch ? GOOGLE_CREDIT : undefined,
    cta: { label: `Plan my ${area.name} day`, url: askUrl(`Plan me a day in ${area.name} under $${args.budget}`, "neighbourhood") },
    outro: "Tap and I'll map the walk between stops, with times.",
  };
}

function spotTitle(s: SpotRow): string {
  if (s.kind === "fall_colours") return s.name.replace(/^Fall colours on /, "Fall colours walk on ");
  if (s.kind === "art") return `Public art: ${s.name}`;
  return s.name;
}

export function composeEvening(args: { dateLabel: string; areaName: string; bites: PlaceRow[]; dinner: PlaceRow[]; coffee: PlaceRow[] }): EmailContent {
  const toItems = (list: PlaceRow[], withKind: boolean) => list.map((p) => ({ title: p.name, detail: placeDetail(p, withKind), tag: priceTag(p) }));
  const sections = [
    { heading: "Quick bites", items: toItems(args.bites, true) },
    { heading: "Dinner under $20", items: toItems(args.dinner, true) },
    { heading: "Coffee to go", items: toItems(args.coffee, false) },
  ].filter((s) => s.items.length > 0);
  const firstTwo = [...args.bites, ...args.dinner].slice(0, 2).map((p) => p.name);
  return {
    dateLabel: args.dateLabel,
    subject: "🥡 Grab-and-go under $20 tonight",
    preheader: `${firstTwo.join(", ")} and more cheap eats open now in ${args.areaName}.`,
    intro: `Clocking out? Here's where to grab something good in ${args.areaName} on the way, and none of it costs more than $20.`,
    sections,
    attribution: "Ratings and prices from Google Maps · open as of 5 pm",
    cta: { label: "Plan my evening", url: askUrl(`Plan my evening in ${args.areaName}: a cheap bite and something free to do`, "evening") },
    outro: "Want a bite and a free show after? Tell me your budget and I'll line it up.",
  };
}

/** Which email is due at this Toronto hour (each window is 2 hours wide because GitHub's scheduler can run late). */
export function dueEmail(hour: number): EmailKind | null {
  if (hour === 9 || hour === 10) return "morning";
  if (hour === 12 || hour === 13) return "neighbourhood";
  if (hour === 17 || hour === 18) return "evening";
  return null;
}

/** Days since 1970 in Toronto: drives the rotations, so each day gets the next neighbourhood and part of town. */
export function dayNumber(isoDay: string): number {
  return Math.floor(Date.parse(`${isoDay}T12:00:00Z`) / 86_400_000);
}
