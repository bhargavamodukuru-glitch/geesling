// Guided-planner choices and the pure logic that turns them into a request for the guide.
// No imports on purpose: this file is unit-tested under plain Node (tests/planner.test.ts).

export type Vibe = "date" | "friends" | "solo" | "new" | "chill" | "culture" | "surprise";
export type TimeChoice = "short" | "medium" | "half" | "flexible";
export type BudgetChoice = "free" | "u25" | "u50" | "flexible";
export type TravelChoice = "walk" | "transit" | "flexible";
export type AreaId = "near" | "explore" | "downtown" | "kensington" | "distillery" | "yorkville" | "leslieville" | "harbourfront";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlanPreferences {
  vibe: Vibe;
  time: TimeChoice;
  budget: BudgetChoice;
  area: AreaId;
  travel: TravelChoice;
}

/**
 * What the guide needs. Fields left undefined fall back to the chat panel's own state,
 * so a plain free-text question keeps working exactly as before.
 */
export interface PlanRequest {
  prompt: string;
  /** Short text shown in the chat bubble instead of the long composed prompt. */
  display?: string;
  timeBudgetMinutes?: number | null;
  freeOnly?: boolean;
  origin?: LatLng | null;
}

interface Option<T extends string> {
  id: T;
  label: string;
  icon: string;
}

export const VIBES: (Option<Vibe> & { sentence: string })[] = [
  { id: "date", label: "Date", icon: "💕", sentence: "a date for two" },
  { id: "friends", label: "Friends", icon: "🎉", sentence: "an outing with friends" },
  { id: "solo", label: "Solo", icon: "🎧", sentence: "a solo outing" },
  { id: "new", label: "Try something new", icon: "✨", sentence: "something new that I haven't tried before" },
  { id: "chill", label: "Chill", icon: "🌙", sentence: "a relaxed, low-key outing" },
  { id: "culture", label: "Artsy & cultural", icon: "🎨", sentence: "an artsy, cultural outing" },
  { id: "surprise", label: "Surprise me", icon: "🎲", sentence: "a surprise: pick something I wouldn't find myself" },
];

/** Vibes offered as one-tap shortcuts on the home screen. */
export const SHORTCUT_VIBES: Vibe[] = ["date", "friends", "solo", "new", "surprise"];

export const TIMES: (Option<TimeChoice> & { minutes: number | null; sentence: string })[] = [
  { id: "short", label: "1–2 hours", icon: "⏱️", minutes: 120, sentence: "I have 1–2 hours." },
  { id: "medium", label: "3–4 hours", icon: "🕓", minutes: 240, sentence: "I have 3–4 hours." },
  { id: "half", label: "Half-day", icon: "🌤️", minutes: 360, sentence: "I have about half a day." },
  { id: "flexible", label: "Flexible", icon: "🔀", minutes: null, sentence: "" },
];

export const BUDGETS: (Option<BudgetChoice> & { sentence: string })[] = [
  { id: "free", label: "Free", icon: "🟩", sentence: "Only free things." },
  { id: "u25", label: "Under $25", icon: "💵", sentence: "Keep the total spend for the whole group under $25, counting tickets, food and drinks." },
  { id: "u50", label: "Under $50", icon: "💵", sentence: "Keep the total spend for the whole group under $50, counting tickets, food and drinks." },
  { id: "flexible", label: "Flexible", icon: "🔀", sentence: "Budget is flexible, but include some free or inexpensive options." },
];

export const TRAVELS: (Option<TravelChoice> & { sentence: string })[] = [
  { id: "walk", label: "Walking", icon: "🚶", sentence: "We'll be on foot: keep every stop within walking distance and don't use transit." },
  { id: "transit", label: "TTC", icon: "🚋", sentence: "We'll use the TTC, so stops can be a few kilometres apart as long as each hop is easy by transit." },
  { id: "flexible", label: "Either", icon: "🔀", sentence: "" },
];

export const DOWNTOWN: LatLng = { lat: 43.6532, lng: -79.3832 };

/** Starting areas offered when location is off. Centres are approximate and only used as search anchors. */
export const AREAS: (Option<AreaId> & { center: LatLng | null; sentence: string })[] = [
  { id: "near", label: "Near me", icon: "📍", center: null, sentence: "Start near my current location." },
  { id: "explore", label: "Explore Toronto", icon: "🏙️", center: DOWNTOWN, sentence: "Explore Toronto: pick the best area for this and start near downtown." },
  { id: "downtown", label: "Downtown", icon: "🌆", center: { lat: 43.6561, lng: -79.3802 }, sentence: "Start in Downtown Toronto." },
  { id: "kensington", label: "Kensington & Queen West", icon: "🧺", center: { lat: 43.654, lng: -79.401 }, sentence: "Start in Kensington Market and Queen West." },
  { id: "distillery", label: "Distillery District", icon: "🏭", center: { lat: 43.6503, lng: -79.3596 }, sentence: "Start in the Distillery District." },
  { id: "yorkville", label: "Yorkville & Annex", icon: "🌳", center: { lat: 43.6709, lng: -79.3939 }, sentence: "Start in Yorkville and the Annex." },
  { id: "leslieville", label: "Leslieville", icon: "☕", center: { lat: 43.6623, lng: -79.335 }, sentence: "Start in Leslieville." },
  { id: "harbourfront", label: "Harbourfront", icon: "⛵", center: { lat: 43.6389, lng: -79.3815 }, sentence: "Start at the Toronto Harbourfront." },
];

export const DEFAULT_PREFERENCES: PlanPreferences = {
  vibe: "surprise",
  time: "medium",
  budget: "flexible",
  area: "explore",
  travel: "flexible",
};

function find<T extends string, O extends Option<T>>(list: O[], id: T): O {
  const found = list.find((o) => o.id === id);
  if (!found) throw new Error(`Unknown planner option: ${id}`);
  return found;
}

/**
 * Turns structured choices into the guide request. `userLocation` is only used when the
 * person chose "Near me"; without it the request carries no origin and the guide asks
 * where to explore, rather than silently assuming a place.
 */
export function buildPlanRequest(prefs: PlanPreferences, userLocation: LatLng | null): PlanRequest {
  const vibe = find(VIBES, prefs.vibe);
  const time = find(TIMES, prefs.time);
  const budget = find(BUDGETS, prefs.budget);
  const area = find(AREAS, prefs.area);
  const travel = find(TRAVELS, prefs.travel);

  const prompt = [
    `Plan me ${vibe.sentence}.`,
    time.sentence,
    budget.sentence,
    area.sentence,
    travel.sentence,
    "Give me one plan that fits all of this, and tell me if anything needs booking or an RSVP ahead of time.",
  ]
    .filter(Boolean)
    .join(" ");

  const origin = prefs.area === "near" ? userLocation : area.center;
  const display = [vibe.label, time.id === "flexible" ? null : time.label, budget.id === "flexible" ? null : budget.label, area.label, travel.id === "flexible" ? null : travel.label]
    .filter(Boolean)
    .join(" · ");

  return {
    prompt,
    display,
    timeBudgetMinutes: time.minutes,
    freeOnly: prefs.budget === "free",
    origin,
  };
}
