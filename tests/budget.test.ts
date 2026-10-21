import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBudget, fitsPerPerson, parseBudget, perPersonCost } from "../supabase/functions/geesling/budget.ts";

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
  assert.deepEqual(checkBudget([freePark, cafe], 25, 1), { total: 20, unknown: [], fits: true });
  assert.equal(checkBudget([cafe, show], 25, 1).fits, false, "$35 is over $25");
  const date = checkBudget([cafe, show], 50, 2);
  assert.equal(date.total, 70, "a date counts both people");
  assert.equal(date.fits, false);
  assert.equal(checkBudget([cafe, show], 70, 2).fits, true, "exactly at the limit fits");
});

test("one unpriced stop makes the walk fail, even if the rest is cheap", () => {
  const check = checkBudget([freePark, unpriced], 50, 1);
  assert.equal(check.fits, false);
  assert.deepEqual(check.unknown, ["Library Bar"]);
});

test("odd budget input means no budget, and the headcount defaults to one", () => {
  assert.equal(parseBudget(null, 2), null);
  assert.equal(parseBudget(-5, 1), null);
  assert.equal(parseBudget("25", 1), null);
  assert.deepEqual(parseBudget(25, undefined), { limit: 25, people: 1 });
  assert.deepEqual(parseBudget(50, 2), { limit: 50, people: 2 });
  assert.deepEqual(parseBudget(50, 2.5), { limit: 50, people: 1 });
});
