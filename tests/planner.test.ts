import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AREAS,
  BUDGETS,
  DEFAULT_PREFERENCES,
  DOWNTOWN,
  TIMES,
  TRAVELS,
  VIBES,
  buildPlanRequest,
  type PlanPreferences,
} from "../src/lib/planner.ts";

const prefs = (overrides: Partial<PlanPreferences> = {}): PlanPreferences => ({ ...DEFAULT_PREFERENCES, ...overrides });
const USER = { lat: 43.7, lng: -79.4 };

test("free budget turns on the free-only filter and says so in the prompt", () => {
  const req = buildPlanRequest(prefs({ budget: "free" }), null);
  assert.equal(req.freeOnly, true);
  assert.match(req.prompt, /Only free things/);
});

test("spend limits are stated as a total for the whole group", () => {
  const req = buildPlanRequest(prefs({ budget: "u25" }), null);
  assert.equal(req.freeOnly, false);
  assert.match(req.prompt, /total spend for the whole group under \$25/);
  assert.match(buildPlanRequest(prefs({ budget: "u50" }), null).prompt, /under \$50/);
});

test("time choices map to minutes, and flexible means no limit", () => {
  assert.equal(buildPlanRequest(prefs({ time: "short" }), null).timeBudgetMinutes, 120);
  assert.equal(buildPlanRequest(prefs({ time: "medium" }), null).timeBudgetMinutes, 240);
  assert.equal(buildPlanRequest(prefs({ time: "half" }), null).timeBudgetMinutes, 360);
  assert.equal(buildPlanRequest(prefs({ time: "flexible" }), null).timeBudgetMinutes, null);
});

test("Near me uses the device location, and never invents one when it is missing", () => {
  assert.deepEqual(buildPlanRequest(prefs({ area: "near" }), USER).origin, USER);
  assert.equal(buildPlanRequest(prefs({ area: "near" }), null).origin, null);
});

test("Explore Toronto and neighbourhoods use fixed anchors, ignoring device location", () => {
  assert.deepEqual(buildPlanRequest(prefs({ area: "explore" }), USER).origin, DOWNTOWN);
  const kensington = buildPlanRequest(prefs({ area: "kensington" }), USER);
  assert.deepEqual(kensington.origin, AREAS.find((a) => a.id === "kensington")?.center);
  assert.match(kensington.prompt, /Kensington Market/);
});

test("walking forbids transit; TTC allows longer hops; either adds nothing", () => {
  assert.match(buildPlanRequest(prefs({ travel: "walk" }), null).prompt, /on foot/);
  assert.match(buildPlanRequest(prefs({ travel: "transit" }), null).prompt, /TTC/);
  const either = buildPlanRequest(prefs({ travel: "flexible" }), null).prompt;
  assert.doesNotMatch(either, /on foot|TTC/);
});

test("the travel choice is passed through so the server can enforce it", () => {
  assert.equal(buildPlanRequest(prefs({ travel: "walk" }), null).travel, "walk");
  assert.equal(buildPlanRequest(prefs({ travel: "transit" }), null).travel, "transit");
  assert.equal(buildPlanRequest(prefs({ travel: "flexible" }), null).travel, "flexible");
});

test("the chat label lists only the choices the person actually made", () => {
  const req = buildPlanRequest(prefs({ vibe: "date", time: "short", budget: "u25", area: "yorkville", travel: "walk" }), null);
  assert.equal(req.display, "Date · 1–2 hours · Under $25 · Yorkville & Annex · Walking");
  assert.equal(buildPlanRequest(prefs({ vibe: "solo", time: "flexible", budget: "flexible", travel: "flexible" }), null).display, "Solo · Explore Toronto");
});

test("every option combination builds a prompt the guide will accept (under 1200 characters)", () => {
  for (const vibe of VIBES) {
    for (const time of TIMES) {
      for (const budget of BUDGETS) {
        for (const area of AREAS) {
          for (const travel of TRAVELS) {
            const req = buildPlanRequest({ vibe: vibe.id, time: time.id, budget: budget.id, area: area.id, travel: travel.id }, USER);
            assert.ok(req.prompt.length > 0 && req.prompt.length < 1200, `${req.display}: ${req.prompt.length} chars`);
          }
        }
      }
    }
  }
});

test("every neighbourhood anchor is inside Toronto", () => {
  for (const area of AREAS) {
    if (!area.center) continue;
    assert.ok(area.center.lat > 43.58 && area.center.lat < 43.86, `${area.id} latitude`);
    assert.ok(area.center.lng > -79.64 && area.center.lng < -79.12, `${area.id} longitude`);
  }
});
