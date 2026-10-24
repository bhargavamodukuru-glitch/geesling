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
  /** "walk" makes the server route every leg on foot (no TTC). */
  travel?: TravelChoice;
  /** The choices behind a planner request, so "Adjust" can reopen the planner with them filled in. */
  prefs?: PlanPreferences;
  /** Spend limit in CAD for everyone covered by `partySize`; the server rejects walks that go over it. */
  budgetLimit?: number | null;
  /** How many people the budget covers. */
  partySize?: number;
  /** The prompt answers the goose's follow-up question (src/lib/choices.ts), so it won't ask again. */
  answered?: boolean;
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

export const BUDGETS: (Option<BudgetChoice> & { amount: number | null })[] = [
  { id: "free", label: "Free", icon: "🟩", amount: 0 },
  { id: "u25", label: "Under $25", icon: "💵", amount: 25 },
  { id: "u50", label: "Under $50", icon: "💵", amount: 50 },
  { id: "flexible", label: "Flexible", icon: "🔀", amount: null },
];

/**
 * Who the budget covers depends on the outing, so the heading, the note and the sentence sent to the guide
 * all come from here instead of always saying "the whole group".
 */
export const BUDGET_WORDING: Record<Vibe, { heading: string; note: string; limit: (amount: number) => string }> = {
  date: {
    heading: "BUDGET FOR THE TWO OF YOU",
    note: "Counts tickets, food and drinks for both of you.",
    limit: (n) => `Keep the total spend for the two of us under $${n}, counting tickets, food and drinks.`,
  },
  friends: {
    heading: "BUDGET PER PERSON",
    note: "Counts each person's tickets, food and drinks.",
    limit: (n) => `Keep the spend per person under $${n}, counting tickets, food and drinks.`,
  },
  solo: {
    heading: "YOUR BUDGET",
    note: "Counts your tickets, food and drinks.",
    limit: (n) => `Keep my total spend under $${n}, counting tickets, food and drinks.`,
  },
  new: {
    heading: "BUDGET FOR YOUR ADVENTURE",
    note: "Counts tickets, food and drinks together.",
    limit: (n) => `Keep the total spend for the whole outing under $${n}, counting tickets, food and drinks.`,
  },
  chill: {
    heading: "BUDGET FOR A CHILL OUTING",
    note: "Counts tickets, food and drinks together.",
    limit: (n) => `Keep the total spend for the whole outing under $${n}, counting tickets, food and drinks.`,
  },
  culture: {
    heading: "BUDGET FOR YOUR ARTSY OUTING",
    note: "Counts tickets, food and drinks together.",
    limit: (n) => `Keep the total spend for the whole outing under $${n}, counting tickets, food and drinks.`,
  },
  surprise: {
    heading: "BUDGET FOR THE SURPRISE",
    note: "Counts tickets, food and drinks together.",
    limit: (n) => `Keep the total spend for the whole outing under $${n}, counting tickets, food and drinks.`,
  },
};

/** How many people a budget covers: a date is two, everything else is counted per person. */
export const PARTY_SIZE: Record<Vibe, number> = { date: 2, friends: 1, solo: 1, new: 1, chill: 1, culture: 1, surprise: 1 };

function budgetSentence(budget: { id: BudgetChoice; amount: number | null }, vibe: Vibe): string {
  if (budget.id === "free") return "Only free things.";
  if (budget.amount === null) return "Budget is flexible, but include some free or inexpensive options.";
  return BUDGET_WORDING[vibe].limit(budget.amount);
}

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
    budgetSentence(budget, prefs.vibe),
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
    travel: prefs.travel,
    prefs,
    budgetLimit: budget.amount !== null && budget.amount > 0 ? budget.amount : null,
    partySize: PARTY_SIZE[prefs.vibe],
  };
}

/** How many times "Try another" can follow one request before the person is nudged to adjust their choices. */
export const MAX_RETRIES = 3;

const PROMPT_LIMIT = 1200; // what the guide accepts
const RETRY_TAIL = " Suggest a clearly different plan.";

/**
 * The same request again, asking for something different. Pass the ORIGINAL request (not an earlier retry)
 * and every place or event name already shown for it; names that don't fit in the prompt are dropped, oldest first.
 */
export function buildRetryRequest(original: PlanRequest, shownNames: string[]): PlanRequest {
  const names = [...new Set(shownNames.map((n) => n.trim()).filter(Boolean))];
  const lead = " I have already seen these, so avoid every one of them:";
  const kept: string[] = [];
  let length = original.prompt.length + RETRY_TAIL.length + lead.length + 1;
  for (const name of names.reverse()) {
    const cost = name.length + 2; // "; "
    if (length + cost > PROMPT_LIMIT) break;
    kept.unshift(name);
    length += cost;
  }
  const avoid = kept.length ? `${lead} ${kept.join("; ")}.` : "";
  return { ...original, prompt: `${original.prompt}${avoid}${RETRY_TAIL}`, display: "Another plan, please" };
}
