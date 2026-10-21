import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AREAS,
  BUDGETS,
  BUDGET_WORDING,
  DEFAULT_PREFERENCES,
  DOWNTOWN,
  TIMES,
  TRAVELS,
  VIBES,
  MAX_RETRIES,
  buildPlanRequest,
  buildRetryRequest,
  type PlanPreferences,
} from "../src/lib/planner.ts";

const prefs = (overrides: Partial<PlanPreferences> = {}): PlanPreferences => ({ ...DEFAULT_PREFERENCES, ...overrides });
const USER = { lat: 43.7, lng: -79.4 };

test("free budget turns on the free-only filter and says so in the prompt", () => {
  const req = buildPlanRequest(prefs({ budget: "free" }), null);
  assert.equal(req.freeOnly, true);
  assert.match(req.prompt, /Only free things/);
});

test("spend limits are stated in the guide's prompt and do not turn on the free-only filter", () => {
  const req = buildPlanRequest(prefs({ budget: "u25" }), null);
  assert.equal(req.freeOnly, false);
  assert.match(req.prompt, /under \$25, counting tickets, food and drinks/);
  assert.match(buildPlanRequest(prefs({ budget: "u50" }), null).prompt, /under \$50/);
});

test("the budget wording fits each vibe: two of us, the group, just me", () => {
  const sentence = (vibe: PlanPreferences["vibe"]) => buildPlanRequest(prefs({ vibe, budget: "u25" }), null).prompt;
  assert.match(sentence("date"), /total spend for the two of us under \$25/);
  assert.match(sentence("friends"), /spend per person under \$25/);
  assert.match(sentence("solo"), /Keep my total spend under \$25/);
  assert.doesNotMatch(sentence("solo"), /group|two of us/);
  assert.match(sentence("surprise"), /whole outing/);
});

test("every vibe has its own budget heading, and none of them claim a group total", () => {
  const headings = Object.values(BUDGET_WORDING).map((w) => w.heading);
  assert.equal(new Set(headings).size, headings.length, "headings are distinct");
  assert.equal(BUDGET_WORDING.date.heading, "BUDGET FOR THE TWO OF YOU");
  assert.equal(BUDGET_WORDING.solo.heading, "YOUR BUDGET");
  assert.equal(BUDGET_WORDING.friends.heading, "BUDGET PER PERSON");
  for (const [vibe, w] of Object.entries(BUDGET_WORDING)) assert.doesNotMatch(w.heading, /GROUP/, vibe);
});

test("a spend limit is sent as a hard limit with the people it covers", () => {
  const date = buildPlanRequest(prefs({ vibe: "date", budget: "u50" }), null);
  assert.equal(date.budgetLimit, 50);
  assert.equal(date.partySize, 2, "a date budget covers both people");
  const friends = buildPlanRequest(prefs({ vibe: "friends", budget: "u25" }), null);
  assert.equal(friends.budgetLimit, 25);
  assert.equal(friends.partySize, 1, "friends is per person");
  assert.equal(buildPlanRequest(prefs({ budget: "free" }), null).budgetLimit, null, "free is enforced by the free-only filter");
  assert.equal(buildPlanRequest(prefs({ budget: "flexible" }), null).budgetLimit, null);
});

test("Try another keeps the spend limit", () => {
  const retry = buildRetryRequest(buildPlanRequest(prefs({ vibe: "date", budget: "u25" }), null), ["The Cups"]);
  assert.equal(retry.budgetLimit, 25);
  assert.equal(retry.partySize, 2);
});

test("free and flexible budgets do not mention a spend limit", () => {
  assert.doesNotMatch(buildPlanRequest(prefs({ budget: "free" }), null).prompt, /under \$/);
  assert.doesNotMatch(buildPlanRequest(prefs({ budget: "flexible" }), null).prompt, /under \$/);
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

test("a planner request remembers its choices so Adjust can reopen them", () => {
  const choices = prefs({ vibe: "date", budget: "u25" });
  assert.deepEqual(buildPlanRequest(choices, null).prefs, choices);
});

test("Try another keeps every constraint and asks to avoid what was already shown", () => {
  const original = buildPlanRequest(prefs({ time: "short", budget: "free", area: "yorkville", travel: "walk" }), null);
  const retry = buildRetryRequest(original, ["Free Night at the Museum", "The Cups", "Free Night at the Museum"]);
  assert.equal(retry.timeBudgetMinutes, 120);
  assert.equal(retry.freeOnly, true);
  assert.equal(retry.travel, "walk");
  assert.deepEqual(retry.origin, original.origin);
  assert.match(retry.prompt, /avoid every one of them: Free Night at the Museum; The Cups\./);
  assert.equal(retry.prompt.split("Free Night at the Museum").length - 1, 1, "duplicate names are listed once");
  assert.equal(retry.display, "Another plan, please");
});

test("Try another asks for something different even when nothing is listed", () => {
  const retry = buildRetryRequest({ prompt: "cheap dumplings" }, []);
  assert.equal(retry.prompt, "cheap dumplings Suggest a clearly different plan.");
});

test("a long avoid list is trimmed (oldest first) to stay under the prompt limit", () => {
  const original = buildPlanRequest(prefs(), null);
  const names = Array.from({ length: 80 }, (_, i) => `Venue number ${i} with a fairly long name`);
  const retry = buildRetryRequest(original, names);
  assert.ok(retry.prompt.length <= 1200, `${retry.prompt.length} chars`);
  assert.match(retry.prompt, /Venue number 79/);
  assert.doesNotMatch(retry.prompt, /Venue number 0 /);
});

test("Try another is capped so it does not become endless regenerating", () => {
  assert.equal(MAX_RETRIES, 3);
});
