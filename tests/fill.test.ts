import assert from "node:assert/strict";
import { test } from "node:test";
import { leavesTooMuchTime, minutesLeftTonight, statedDuration } from "../supabase/functions/geesling/fill.ts";

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

test("durations written in the message are read", () => {
  assert.equal(statedDuration("in the city for about 12 hours today"), 720);
  assert.equal(statedDuration("I have 3-4 hrs"), 240, "a range counts as its top");
  assert.equal(statedDuration("I have 3–4 hours."), 240);
  assert.equal(statedDuration("two hours to kill"), 120);
  assert.equal(statedDuration("90 minutes before my train"), 90);
  assert.equal(statedDuration("free all day"), 600);
  assert.equal(statedDuration("half a day downtown"), 360);
  assert.equal(statedDuration("a few hours"), 180);
  assert.equal(statedDuration("48 hours in Toronto"), 960, "capped at 16 hours");
  assert.equal(statedDuration("cheap dumplings and a gallery"), null);
  assert.equal(statedDuration("open 24h diner"), 960, "known limit: an opening-hours phrase reads as a duration");
});

// 2026-10-21 01:04 UTC is 9:04 pm in Toronto (EDT, UTC-4).
test("a late-evening request only has the hours until 2 am", () => {
  assert.equal(minutesLeftTonight(new Date("2026-10-21T01:04:00Z")), 296);
  assert.equal(minutesLeftTonight(new Date("2026-10-20T14:00:00Z")), 16 * 60, "10 am has 16 hours");
  assert.equal(minutesLeftTonight(new Date("2026-10-21T05:00:00Z")), 60, "1 am has an hour");
  assert.equal(minutesLeftTonight(new Date("2026-10-21T07:30:00Z")), null, "3:30 am has no cutoff");
});
