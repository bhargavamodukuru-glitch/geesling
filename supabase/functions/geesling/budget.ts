// Spend-limit checks for planner budgets. Pure and import-free so it runs under plain Node (tests/budget.test.ts).
//
// Only listed prices count, never guesses:
// - an event costs its cheapest listed ticket (people can pick that ticket);
// - a place costs the top of Google's per-person price range (a meal bill can't be chosen in advance);
// - anything confirmed free costs 0;
// - everything else is "unknown" and cannot be part of a walk with a budget.

export interface PricedItem {
  kind: "event" | "place";
  is_free: boolean;
  price_min?: number | null;
  price_to?: number | null;
}

/** Per-person cost in CAD, or null when no price is listed. */
export function perPersonCost(item: PricedItem): number | null {
  if (item.is_free) return 0;
  if (item.kind === "event") return typeof item.price_min === "number" ? item.price_min : null;
  return typeof item.price_to === "number" ? item.price_to : null;
}

/** Whether one item could appear in a walk with this per-person limit at all. */
export function fitsPerPerson(item: PricedItem, perPersonLimit: number): boolean {
  const cost = perPersonCost(item);
  return cost !== null && cost <= perPersonLimit;
}

export interface BudgetCheck {
  /** Total for everyone, counting only priced stops. */
  total: number;
  /** Names of stops with no listed price. */
  unknown: string[];
  fits: boolean;
}

export function checkBudget(stops: Array<PricedItem & { name: string }>, limit: number, people: number): BudgetCheck {
  let perPerson = 0;
  const unknown: string[] = [];
  for (const stop of stops) {
    const cost = perPersonCost(stop);
    if (cost === null) unknown.push(stop.name);
    else perPerson += cost;
  }
  const total = Math.round(perPerson * people * 100) / 100;
  return { total, unknown, fits: unknown.length === 0 && total <= limit };
}

/** Reads a planner budget from the request body; anything odd means "no budget". */
export function parseBudget(limit: unknown, people: unknown): { limit: number; people: number } | null {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0 || limit > 5000) return null;
  const count = typeof people === "number" && Number.isInteger(people) && people >= 1 && people <= 20 ? people : 1;
  return { limit, people: count };
}
