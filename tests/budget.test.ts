import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBudget, fitsPerPerson, parseBudget, perPersonCost, statedBudget } from "../supabase/functions/geesling/budget.ts";

const freePark = { kind: "place" as const, is_free: true, name: "Trinity Bellwoods" };
const cafe = { kind: "place" as const, is_free: false, price_to: 20, name: "The Cups" };
const pub = { kind: "place" as const, is_free: false, price_to: 60, name: "Firkin" };
const unpriced = { kind: "place" as const, is_free: false, price_to: null, name: "Library Bar" };
const show = { kind: "event" as const, is_free: false, price_min: 15, name: "Comedy night" };
const unlistedShow = { kind: "event" as const, is_free: false, price_min: null, name: "Secret gig" };

test("only listed prices count: cheapest ticket for events, top of the range for places", () => {
  assert.equal(perPersonCost(freePark), 0);
  assert.equal(perPersonCost(cafe), 20);
  assert.equal(perPersonCost(show), 15);
  assert.equal(perPersonCost(unpriced), null, "a $$ level is not a price");
  assert.equal(perPersonCost(unlistedShow), null);
});

test("search results that can't fit on their own are left out", () => {
  assert.equal(fitsPerPerson(cafe, 25), true);
  assert.equal(fitsPerPerson(pub, 25), false, "$20–60 could be $60");
  assert.equal(fitsPerPerson(unpriced, 25), false, "unknown price can't be promised");
  assert.equal(fitsPerPerson(freePark, 0), true);
});

test("a walk fits when every stop is priced and the total for everyone is within the limit", () => {
  assert.deepEqual(checkBudget([freePark, cafe], { min: 0, limit: 25, people: 1 }), { total: 20, totalLow: 20, unknown: [], outside: null, fits: true });
  assert.equal(checkBudget([cafe, show], { min: 0, limit: 25, people: 1 }).fits, false, "$35 is over $25");
  const date = checkBudget([cafe, show], { min: 0, limit: 50, people: 2 });
  assert.equal(date.total, 70, "a date counts both people");
  assert.equal(date.fits, false);
  assert.equal(checkBudget([cafe, show], { min: 0, limit: 70, people: 2 }).fits, true, "exactly at the limit fits");
});

test("one unpriced stop makes the walk fail, even if the rest is cheap", () => {
  const check = checkBudget([freePark, unpriced], { min: 0, limit: 50, people: 1 });
  assert.equal(check.fits, false);
  assert.deepEqual(check.unknown, ["Library Bar"]);
});

test("odd budget input means no budget, and the headcount defaults to one", () => {
  assert.equal(parseBudget(null, 2), null);
  assert.equal(parseBudget(-5, 1), null);
  assert.equal(parseBudget("25", 1), null);
  assert.deepEqual(parseBudget(25, undefined), { min: 0, limit: 25, people: 1 });
  assert.deepEqual(parseBudget(50, 2), { min: 0, limit: 50, people: 2 });
  assert.deepEqual(parseBudget(50, 2.5), { min: 0, limit: 50, people: 1 });
});

test("typed budgets become a hard limit with the people they cover", () => {
  assert.deepEqual(statedBudget("date night, under $50, downtown or lesliville area."), { min: 0, limit: 50, people: 2 }, "under $50 is $0 to $50");
  assert.deepEqual(statedBudget("cheap eats under $20"), { min: 0, limit: 20, people: 1 });
  assert.deepEqual(statedBudget("$30 budget for two"), { min: 0, limit: 30, people: 2 });
  assert.deepEqual(statedBudget("max $25 each, for 4 of us"), { min: 0, limit: 100, people: 4 }, "per person times people");
  assert.deepEqual(statedBudget("budget of $40"), { min: 0, limit: 40, people: 1 });
  assert.equal(statedBudget("a fancy dinner, money is no object"), null);
  assert.equal(statedBudget("free stuff for 2 hours"), null);
});

test("a typed range uses its min and max", () => {
  assert.deepEqual(statedBudget("date night, $30-$60, leslieville"), { min: 30, limit: 60, people: 2 });
  assert.deepEqual(statedBudget("somewhere between $40 and $80 for 4"), { min: 40, limit: 80, people: 4 });
  assert.deepEqual(statedBudget("$20 to $30 each, a date"), { min: 40, limit: 60, people: 2 }, "per person range times two");
  assert.deepEqual(statedBudget("$60 - $30 for two"), { min: 30, limit: 60, people: 2 }, "order doesn't matter");
});

test("a walk must land inside the range: not over the max, not under the min", () => {
  const range = { min: 30, limit: 60, people: 2 };
  const pricey = { kind: "place" as const, is_free: false, price_from: 20, price_to: 30, name: "Bistro" };
  assert.equal(checkBudget([freePark], range).outside, "under", "an all-free date is below a $30 minimum");
  assert.deepEqual(checkBudget([pricey, freePark], range).fits, true, "$40–$60 for two fits $30–$60");
  assert.equal(checkBudget([pricey, cafe], range).outside, "over", "can reach $100");
  assert.equal(checkBudget([freePark], { min: 0, limit: 50, people: 2 }).fits, true, "under $X allows free");
});

test("a minimum above the maximum is ignored", () => {
  assert.deepEqual(parseBudget(50, 2, 80), { min: 0, limit: 50, people: 2 });
});
