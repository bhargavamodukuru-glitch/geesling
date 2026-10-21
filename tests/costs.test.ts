import assert from "node:assert/strict";
import { test } from "node:test";
import { claudeCost, costRows, money, overage, projected, type CostReport } from "../supabase/functions/usage-report/costs.ts";

const report = (usage: CostReport["usage"], over: Partial<CostReport> = {}): CostReport => ({
  month_start: "2026-10-01",
  days_elapsed: 20,
  days_in_month: 31,
  metering_since: "2026-10-21 10:00",
  usage,
  db_bytes: 19_000_000,
  monthly_active_users: 60,
  total_users: 60,
  ...over,
});

test("inside the free allowance costs nothing; past it, each 1,000 is billed", () => {
  assert.equal(overage(999, 1000, 40), 0);
  assert.equal(overage(1500, 1000, 40), 20);
});

test("month-end projection keeps the same daily rate", () => {
  assert.equal(projected(200, 20, 31), 310);
  assert.equal(projected(0, 0, 31), 0);
});

test("Claude spend adds input, output and cache tokens at Haiku prices", () => {
  const c = claudeCost(report([
    { service: "anthropic", sku: "claude-haiku-5-5:input", units: 1_000_000 },
    { service: "anthropic", sku: "claude-haiku-5-5:output", units: 1_000_000 },
    { service: "anthropic", sku: "claude-haiku-5-5:cache_read", units: 1_000_000 },
  ]));
  assert.ok(Math.abs(c.cost - (0.1 + 0.5 + 0.01)) < 1e-9, String(c.cost));
  assert.equal(c.output, 1_000_000);
  assert.deepEqual(c.unpriced, []);
  assert.deepEqual(claudeCost(report([{ service: "anthropic", sku: "claude-mystery:input", units: 5 }])).unpriced, ["claude-mystery"]);
});

test("the Places row shows free searches left, and cost only once the 1,000 are used", () => {
  const rows = costRows(report([{ service: "google_places", sku: "text_search_enterprise_atmosphere", units: 240 }]));
  const places = rows.find((r) => r[0] === "Google Places")!;
  assert.equal(places[3], "240", "used");
  assert.equal(places[4], "760", "left");
  assert.equal(places[6], "$0.00", "cost so far");
  assert.equal(places[7], "$0.00", "240 a day-20 pace projects to 372, still free");
  const busy = costRows(report([{ service: "google_places", sku: "text_search_enterprise_atmosphere", units: 1500 }]));
  const row = busy.find((r) => r[0] === "Google Places")!;
  assert.equal(row[4], "0");
  assert.equal(row[6], "$20.00");
});

test("the total adds every metered cost", () => {
  const rows = costRows(report([
    { service: "google_places", sku: "text_search_enterprise_atmosphere", units: 2000 },
    { service: "anthropic", sku: "claude-haiku-5-5:output", units: 2_000_000 },
  ]));
  const total = rows.find((r) => r[0] === "TOTAL (estimate)")!;
  assert.equal(total[6], "$41.00", "$40 of Places + $1 of Claude");
});

test("tiny amounts aren't rounded away", () => {
  assert.equal(money(0), "$0.00");
  assert.equal(money(0.0015), "$0.0015");
  assert.equal(money(12.5), "$12.50");
});
