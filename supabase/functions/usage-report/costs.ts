// Free allowances, prices and the Costs tab rows. Pure and import-free (tests/costs.test.ts).
// Prices checked 2026-10-20/21:
// - Google Maps Platform: developers.google.com/maps/billing-and-pricing/pricing (free caps are per SKU per month).
// - Claude: Anthropic model pricing (Haiku 5.5 $0.10 / $0.50 per million input / output tokens). Cache prices are estimates
//   from the usual ratios (reads 10% of input, writes 125%) and are marked as such.
// - Supabase Free plan: supabase.com/pricing. Expo Free plan: expo.dev/pricing.

export interface CostReport {
  month_start: string;
  days_elapsed: number;
  days_in_month: number;
  metering_since: string | null;
  usage: Array<{ service: string; sku: string; units: number }>;
  db_bytes: number;
  monthly_active_users: number;
  total_users: number;
}

type Row = Array<string | number | null>;

/** Per million tokens, USD. */
const CLAUDE_PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};
const CACHE_READ_SHARE = 0.1;
const CACHE_WRITE_SHARE = 1.25;

interface Metered {
  service: string;
  what: string;
  free: number;
  /** USD per 1,000 units past the free allowance. */
  per1000: number;
  units: number;
  note: string;
}

// Fractions of a cent are shown rather than rounded to $0.00, so early Claude spend is visible.
export const money = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const count = (n: number) => Math.round(n).toLocaleString("en-CA");

function unitsOf(report: CostReport, service: string, sku?: string): number {
  return report.usage.filter((u) => u.service === service && (!sku || u.sku === sku)).reduce((sum, u) => sum + Number(u.units), 0);
}

/** Cost of `units` after the free allowance. */
export function overage(units: number, free: number, per1000: number): number {
  return (Math.max(0, units - free) / 1000) * per1000;
}

/** Units at month end if usage carries on at the same daily rate. */
export function projected(units: number, daysElapsed: number, daysInMonth: number): number {
  if (daysElapsed <= 0) return units;
  return (units / Math.max(daysElapsed, 1)) * daysInMonth;
}

/** Claude spend this month from metered tokens, per model. */
export function claudeCost(report: CostReport): { cost: number; input: number; output: number; unpriced: string[] } {
  let cost = 0;
  let input = 0;
  let output = 0;
  const unpriced = new Set<string>();
  for (const u of report.usage.filter((x) => x.service === "anthropic")) {
    const [model, kind] = u.sku.split(":");
    const price = CLAUDE_PRICES[model];
    const n = Number(u.units);
    if (kind === "output") output += n;
    else input += n;
    if (!price) {
      unpriced.add(model);
      continue;
    }
    const perToken = kind === "output" ? price.output : kind === "cache_read" ? price.input * CACHE_READ_SHARE : kind === "cache_write" ? price.input * CACHE_WRITE_SHARE : price.input;
    cost += (n / 1_000_000) * perToken;
  }
  return { cost, input, output, unpriced: [...unpriced] };
}

export const HEADER: Row = ["Service", "What's counted", "Free each month", "Used this month", "Free left", "Price after free", "Cost so far", "Projected month-end cost", "Notes"];

export function costRows(report: CostReport): Row[] {
  const { days_elapsed: elapsed, days_in_month: days } = report;
  const metered: Metered[] = [
    {
      service: "Google Places",
      what: "Text Search (Enterprise + Atmosphere) calls by the guide",
      free: 1000,
      per1000: 40,
      units: unitsOf(report, "google_places"),
      note: "Geesling stops at 990 a month (hard cap), so this stays free. Reviews and descriptions in the request put every search in this tier.",
    },
    {
      service: "Google Routes",
      what: "Compute Routes calls (walking + TTC)",
      free: 10000,
      per1000: 5,
      units: unitsOf(report, "google_routes"),
      note: `Walking ${count(unitsOf(report, "google_routes", "compute_routes:walk"))}, TTC ${count(unitsOf(report, "google_routes", "compute_routes:transit"))}. Priced as Essentials; Google may bill TTC requests at Pro ($10/1,000, 5,000 free).`,
    },
    {
      service: "Google Maps (web)",
      what: "Dynamic Maps loads on the website",
      free: 10000,
      per1000: 7,
      units: unitsOf(report, "google_maps_js"),
      note: "The iPhone and Android map SDKs are free and not counted.",
    },
    {
      service: "Supabase functions",
      what: "Guide (geesling) invocations",
      free: 500000,
      per1000: 0,
      units: unitsOf(report, "supabase_functions"),
      note: "Free plan: past the allowance you upgrade to Pro ($25/month, 2M included). The hourly sheet refresh isn't counted.",
    },
  ];

  const rows: Row[] = [HEADER];
  let soFar = 0;
  let monthEnd = 0;
  for (const m of metered) {
    const cost = overage(m.units, m.free, m.per1000);
    const end = overage(projected(m.units, elapsed, days), m.free, m.per1000);
    soFar += cost;
    monthEnd += end;
    rows.push([
      m.service,
      m.what,
      count(m.free),
      count(m.units),
      count(Math.max(0, m.free - m.units)),
      m.per1000 ? `${money(m.per1000)} per 1,000` : "Plan upgrade",
      money(cost),
      money(end),
      m.note,
    ]);
  }

  const claude = claudeCost(report);
  soFar += claude.cost;
  monthEnd += projected(claude.cost, elapsed, days);
  rows.push([
    "Claude (Anthropic)",
    "Tokens used by the guide",
    "None (prepaid credit)",
    `${count(claude.input)} in / ${count(claude.output)} out`,
    "Check your credit balance at console.anthropic.com",
    "$0.10 in / $0.50 out per million (Haiku 5.5)",
    money(claude.cost),
    money(projected(claude.cost, elapsed, days)),
    claude.unpriced.length ? `Not priced (unknown model): ${claude.unpriced.join(", ")}.` : "Cache read/write prices are estimates.",
  ]);

  const mb = report.db_bytes / 1_000_000;
  rows.push(["Supabase database", "Database size", "500 MB", `${mb.toFixed(1)} MB`, `${Math.max(0, 500 - mb).toFixed(1)} MB`, "Plan upgrade", "$0.00", "$0.00", "Free plan limit."]);
  rows.push(["Supabase users", "Monthly active users", count(50000), count(report.monthly_active_users), count(Math.max(0, 50000 - report.monthly_active_users)), "Plan upgrade", "$0.00", "$0.00", `${count(report.total_users)} anonymous accounts in total.`]);
  rows.push(["Supabase egress", "Data downloaded", "5 GB", "Not measured here", "", "Plan upgrade", "$0.00", "$0.00", "See the Supabase dashboard → Usage."]);
  rows.push(["Expo hosting", "Website requests", count(100000), "Not measured here", "", "$2 per 1M (paid plans)", "$0.00", "$0.00", "See expo.dev → Hosting → Usage."]);
  rows.push(["Ticketmaster, City of Toronto, GitHub Actions", "Event imports every 3 hours", "Free", "", "", "", "$0.00", "$0.00", "No usage charges (public repo, free APIs)."]);
  rows.push([]);
  rows.push(["TOTAL (estimate)", "", "", "", "", "", money(soFar), money(monthEnd), "Projection assumes the same daily rate for the rest of the month."]);
  rows.push(["Month", report.month_start, "", "", "", "", "", "", `Day ${Math.max(1, Math.ceil(elapsed))} of ${days}. Counting since ${report.metering_since ?? "the next guide request"}; earlier usage this month wasn't counted.`]);
  return rows;
}
