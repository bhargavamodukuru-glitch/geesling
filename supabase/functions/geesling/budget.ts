// Spend-range checks for budgets. Pure and import-free so it runs under plain Node (tests/budget.test.ts).
//
// A budget is a range for everyone together: "under $50" is $0–$50, "$30 to $60" is $30–$60.
// Only listed prices count, never guesses:
// - an event costs its cheapest listed ticket (people can pick that ticket);
// - a place costs the top of Google's per-person price range against the maximum (a meal bill can't be chosen
//   in advance) and the bottom of it against the minimum;
// - anything confirmed free costs 0;
// - everything else is "unknown" and cannot be part of a walk with a budget.

export interface PricedItem {
  kind: "event" | "place";
  is_free: boolean;
  price_min?: number | null;
  price_from?: number | null;
  price_to?: number | null;
}

export interface Budget {
  /** Least the whole outing should cost, for everyone together (0 for "under $X"). */
  min: number;
  /** Most it may cost, for everyone together. */
  limit: number;
  people: number;
}

/** Per-person cost in CAD at most, or null when no price is listed. */
export function perPersonCost(item: PricedItem): number | null {
  if (item.is_free) return 0;
  if (item.kind === "event") return typeof item.price_min === "number" ? item.price_min : null;
  return typeof item.price_to === "number" ? item.price_to : null;
}

/** Per-person cost in CAD at least (the bottom of a place's range), or null when no price is listed. */
export function perPersonLowCost(item: PricedItem): number | null {
  if (item.is_free) return 0;
  if (item.kind === "event") return typeof item.price_min === "number" ? item.price_min : null;
  if (typeof item.price_from === "number") return item.price_from;
  return typeof item.price_to === "number" ? item.price_to : null;
}

/** Whether one item could appear in a walk with this per-person limit at all. */
export function fitsPerPerson(item: PricedItem, perPersonLimit: number): boolean {
  const cost = perPersonCost(item);
  return cost !== null && cost <= perPersonLimit;
}

export interface BudgetCheck {
  /** Most the walk can cost for everyone, counting only priced stops. */
  total: number;
  /** Least it will cost for everyone. */
  totalLow: number;
  /** Names of stops with no listed price. */
  unknown: string[];
  /** "over" the maximum, "under" the minimum, or null when it lands in the range. */
  outside: "over" | "under" | null;
  fits: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function checkBudget(stops: Array<PricedItem & { name: string }>, budget: Budget): BudgetCheck {
  let high = 0;
  let low = 0;
  const unknown: string[] = [];
  for (const stop of stops) {
    const cost = perPersonCost(stop);
    if (cost === null) unknown.push(stop.name);
    else {
      high += cost;
      low += perPersonLowCost(stop) ?? cost;
    }
  }
  const total = round(high * budget.people);
  const totalLow = round(low * budget.people);
  const outside = total > budget.limit ? "over" : totalLow < budget.min ? "under" : null;
  return { total, totalLow, unknown, outside, fits: unknown.length === 0 && outside === null };
}

/** Reads a budget from the request body; anything odd means "no budget". A missing or odd minimum is $0. */
export function parseBudget(limit: unknown, people: unknown, min: unknown = 0): Budget | null {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0 || limit > 5000) return null;
  const count = typeof people === "number" && Number.isInteger(people) && people >= 1 && people <= 20 ? people : 1;
  const floor = typeof min === "number" && Number.isFinite(min) && min > 0 && min < limit ? min : 0;
  return { min: floor, limit, people: count };
}

const WORD_COUNT: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

/**
 * A budget typed into the chat, enforced like the planner's. "under $50" (or "$30 budget", "max $40") is $0 to that
 * amount; a range ("$30-$60", "$30 to $60", "between $30 and $60") uses its min and max.
 * "date", "for two" or "the two of us" covers two people; "for 4" four. A per-person phrase ("each", "pp")
 * multiplies the amounts by the people. Null when no amount is named.
 */
export function statedBudget(prompt: string): Budget | null {
  const text = prompt.toLowerCase();
  const range = /\$\s?(\d{1,4})\s*(?:-|–|to|and)\s*\$?\s?(\d{1,4})\b/.exec(text);
  const amount =
    /\b(?:under|below|less than|max(?:imum)?|up to|no more than|within|at most)\s*(?:of\s*)?\$\s?(\d{1,4})\b/.exec(text) ??
    /\$\s?(\d{1,4})\s*(?:budget|max|or less|tops|total)\b/.exec(text) ??
    /\bbudget\s*(?:of|is|:)?\s*\$\s?(\d{1,4})\b/.exec(text);
  if (!amount && !range) return null;
  const n = /\bfor (\d{1,2}|two|three|four|five|six|seven|eight)\b(?! hours?| hrs?| min)/.exec(text);
  const people = n
    ? Number(n[1]) || WORD_COUNT[n[1]]
    : /\b(date|two of us|both of us|couple|my partner|my (?:girl|boy)friend|my wife|my husband)\b/.test(text)
      ? 2
      : 1;
  const perPerson = /\b(each|per person|pp|a head|per head)\b/.test(text);
  const scale = perPerson ? people : 1;
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])];
    return parseBudget(Math.max(a, b) * scale, people, Math.min(a, b) * scale);
  }
  return parseBudget(Number(amount![1]) * scale, people);
}
