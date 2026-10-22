import assert from "node:assert/strict";
import { test } from "node:test";
import { eventTimingProblems, minutesNeeded } from "../supabase/functions/geesling/timing.ts";

// Toronto is UTC-4 in October.
const at = (hhmm: string) => new Date(`2026-10-22T${hhmm}:00-04:00`).toISOString();
const event = (arrive: string, start: string, end: string) => ({ name: "Jazz at the Rex", kind: "event" as const, arrive_at: at(arrive), next_start: at(start), next_end: at(end) });

test("arriving at 6:55 for an event ending at 7 is flagged", () => {
  const [problem] = eventTimingProblems([event("18:55", "17:00", "19:00")]);
  assert.match(problem, /reach Jazz at the Rex at 6:55 p\.m\. and it ends at 7:00 p\.m\.: only 5 min there/);
});

test("arriving after it ends is flagged", () => {
  assert.match(eventTimingProblems([event("19:10", "17:00", "19:00")])[0], /ends at 7:00 p\.m\., before you'd arrive at 7:10 p\.m\./);
});

test("plenty of time, or arriving before doors, is fine", () => {
  assert.deepEqual(eventTimingProblems([event("17:30", "17:00", "19:00")]), []);
  assert.deepEqual(eventTimingProblems([event("16:40", "17:00", "19:00")]), [], "waits for doors");
});

test("a short event needs most of its length, not a fixed 30 minutes", () => {
  assert.equal(minutesNeeded(at("19:00"), at("19:20")), 16);
  assert.equal(minutesNeeded(at("19:00"), at("19:05")), 10, "never less than 10");
  assert.equal(minutesNeeded(at("12:00"), at("22:00")), 30);
  assert.deepEqual(eventTimingProblems([event("19:02", "19:00", "19:20")]), [], "18 of 20 minutes left is enough");
});

test("places aren't checked here", () => {
  assert.deepEqual(eventTimingProblems([{ name: "Café", kind: "place", arrive_at: at("23:00") }]), []);
});
