import assert from "node:assert/strict";
import { test } from "node:test";
import { leavesTooMuchTime } from "../supabase/functions/geesling/fill.ts";

test("a walk that uses most of the time is fine", () => {
  assert.equal(leavesTooMuchTime(200, 240, 3), false);
  assert.equal(leavesTooMuchTime(144, 240, 2), false, "exactly 60% is enough");
});

test("a walk that leaves most of a long window empty is sent back", () => {
  assert.equal(leavesTooMuchTime(60, 240, 1), true, "one dessert stop for a 3–4 hour outing");
  assert.equal(leavesTooMuchTime(90, 240, 2), true);
});

test("short outings, no time budget, or an already full walk are left alone", () => {
  assert.equal(leavesTooMuchTime(20, 60, 1), false, "under 90 minutes");
  assert.equal(leavesTooMuchTime(30, null, 1), false);
  assert.equal(leavesTooMuchTime(100, 360, 6), false);
});
