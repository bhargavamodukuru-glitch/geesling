import assert from "node:assert/strict";
import { test } from "node:test";
import { dayPart, notBefore, parseClock } from "../supabase/functions/geesling/daytime.ts";
import { dayPart as cardDayPart } from "../src/lib/dayParts.ts";

// Toronto is UTC-4 in October 2026.
const at = (local: string) => new Date(`2026-10-21T${local}:00-04:00`);

test("clock times are read in 24-hour and am/pm forms", () => {
  assert.equal(parseClock("17:30"), 17 * 60 + 30);
  assert.equal(parseClock("5:30 pm"), 17 * 60 + 30);
  assert.equal(parseClock("5pm"), 17 * 60);
  assert.equal(parseClock("12 am"), 0);
  assert.equal(parseClock("12:15 p.m."), 12 * 60 + 15);
  assert.equal(parseClock("dinner"), null);
  assert.equal(parseClock("25:00"), null);
  assert.equal(parseClock("13 pm"), null);
});

test("a meal set for dinner waits until dinner time", () => {
  assert.equal(notBefore(at("14:15"), "17:30").toISOString(), at("17:30").toISOString());
});

test("no wait when the stop is already late enough, the time is unreadable, or the wait is absurd", () => {
  assert.equal(notBefore(at("18:00"), "17:30").toISOString(), at("18:00").toISOString());
  assert.equal(notBefore(at("14:15"), "whenever").toISOString(), at("14:15").toISOString());
  assert.equal(notBefore(at("09:00"), "19:00").toISOString(), at("09:00").toISOString(), "a 10-hour wait is ignored");
  assert.equal(notBefore(at("14:15"), undefined).toISOString(), at("14:15").toISOString());
});

test("parts of the day, the same on the server and the walk card", () => {
  const cases: Array<[string, string]> = [["10:00", "morning"], ["11:59", "morning"], ["12:00", "afternoon"], ["16:59", "afternoon"], ["17:00", "evening"], ["23:30", "evening"], ["01:00", "evening"]];
  for (const [local, part] of cases) {
    assert.equal(dayPart(at(local)), part, local);
    assert.equal(cardDayPart(at(local).toISOString()), part, `card ${local}`);
  }
});
