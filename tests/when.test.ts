import assert from "node:assert/strict";
import { test } from "node:test";
import { dayPart, dayPartMinutes, relativeDay, requestedClock, requestedStart, torontoTime } from "../supabase/functions/geesling/when.ts";

// Tuesday 2026-10-20, 9:04 pm in Toronto (EDT, UTC-4).
const NOW = new Date("2026-10-21T01:04:00Z");
const local = (iso: string) => new Date(`${iso}-04:00`).toISOString();
const CLIENT = "i have a meeting with a client tomorrow at 12pm and ive never been to Toronto. Where do I take them for lunch?";

test("everyday day words are read relative to today in Toronto", () => {
  assert.deepEqual(relativeDay(CLIENT, NOW), { year: 2026, month: 9, day: 21 });
  assert.deepEqual(relativeDay("something fun tonight", NOW), { year: 2026, month: 9, day: 20 });
  assert.deepEqual(relativeDay("friday night drinks", NOW), { year: 2026, month: 9, day: 23 });
  assert.deepEqual(relativeDay("next tuesday", NOW), { year: 2026, month: 9, day: 27 }, "next on the same weekday is a week out");
  assert.deepEqual(relativeDay("tuesday", NOW), { year: 2026, month: 9, day: 20 }, "today's weekday is today");
  assert.deepEqual(relativeDay("this weekend with friends", NOW), { year: 2026, month: 9, day: 24 });
  assert.equal(relativeDay("cheap dumplings and a gallery", NOW), null);
  assert.equal(relativeDay("a monumental view", NOW), null, "'mon' inside a word is not Monday");
  assert.equal(relativeDay("a patio in the sun", NOW), null, "'sun' is not Sunday");
  assert.equal(relativeDay("we sat by the lake", NOW), null, "'sat' is not Saturday");
});

test("times and meal words are read as a time of day", () => {
  assert.equal(requestedClock(CLIENT), 12 * 60);
  assert.equal(requestedClock("dinner at 7:30 pm"), 19 * 60 + 30);
  assert.equal(requestedClock("meet at 7"), 19 * 60, "a bare 7 is the evening");
  assert.equal(requestedClock("coffee at 10"), 10 * 60);
  assert.equal(requestedClock("around noon"), 12 * 60);
  assert.equal(requestedClock("brunch spot"), 11 * 60);
  assert.equal(requestedClock("somewhere for dinner"), 18 * 60);
  assert.equal(requestedClock("free for 2 hours"), null, "a duration is not a time");
  assert.equal(requestedClock("about 12 hours today"), null);
  assert.equal(requestedClock("cheap dumplings"), null);
});

test("the client-lunch request starts at noon tomorrow", () => {
  const start = requestedStart(CLIENT, NOW, relativeDay(CLIENT, NOW));
  assert.equal(start?.toISOString(), local("2026-10-21T12:00:00"));
});

test("a future day without a time starts at 10 am, not midnight", () => {
  const prompt = "what should I do on saturday";
  assert.equal(requestedStart(prompt, NOW, relativeDay(prompt, NOW))?.toISOString(), local("2026-10-24T10:00:00"));
});

test("today with no time, or a time already passed, means now", () => {
  assert.equal(requestedStart("cheap dumplings", NOW, null), null);
  assert.equal(requestedStart("lunch today", NOW, relativeDay("lunch today", NOW)), null, "noon has passed at 9 pm");
  assert.equal(requestedStart("a drink at 11pm", NOW, null)?.toISOString(), local("2026-10-20T23:00:00"));
});

test("Toronto times survive the switch back to standard time", () => {
  assert.equal(torontoTime({ year: 2026, month: 10, day: 2 }, 12 * 60).toISOString(), "2026-11-02T17:00:00.000Z", "EST is UTC-5");
});

test("parts of the day: night from 5 pm, evening from 4 pm, afternoon noon to 4, morning 8 to noon", () => {
  assert.equal(dayPart("date night, under $50")?.start, 17 * 60);
  assert.equal(dayPart("friday night drinks")?.start, 17 * 60);
  assert.equal(dayPart("something fun tonight")?.start, 17 * 60);
  assert.equal(dayPart("a chill evening")?.start, 16 * 60);
  assert.deepEqual(dayPart("lazy afternoon"), { name: "afternoon", start: 12 * 60, end: 16 * 60 });
  assert.deepEqual(dayPart("saturday morning coffee"), { name: "morning", start: 8 * 60, end: 12 * 60 });
  assert.equal(dayPart("nightlife and bars"), null, "nightlife is not a time");
  assert.equal(dayPart("cheap dumplings"), null);
});

// Wednesday 2026-10-21, 9:46 am in Toronto: when the date-night request came in.
const MORNING = new Date("2026-10-21T13:46:00Z");

test("'date night' asked in the morning starts at 5 pm today, not now", () => {
  assert.equal(requestedStart("date night, under $50, downtown", MORNING, relativeDay("date night", MORNING))?.toISOString(), local("2026-10-21T17:00:00"));
});

test("inside the part of the day it starts now; after it, a dinner time still wins", () => {
  const eightPm = new Date("2026-10-22T00:00:00Z");
  assert.equal(requestedStart("date night", eightPm, null), null, "already night: start now");
  assert.equal(requestedStart("evening walk", new Date("2026-10-21T21:00:00Z"), null), null, "5 pm is evening");
  assert.equal(requestedStart("dinner date tonight", MORNING, null)?.toISOString(), local("2026-10-21T18:00:00"), "dinner beats night");
});

test("a morning asked for after it's over means tomorrow morning", () => {
  const twoPm = new Date("2026-10-21T18:00:00Z");
  assert.equal(requestedStart("a slow morning", twoPm, null)?.toISOString(), local("2026-10-22T08:00:00"));
});

test("a bounded part of the day limits how long the walk runs", () => {
  assert.equal(dayPartMinutes("lazy afternoon", new Date(local("2026-10-21T12:00:00"))), 240);
  assert.equal(dayPartMinutes("lazy afternoon", new Date(local("2026-10-21T14:30:00"))), 90);
  assert.equal(dayPartMinutes("date night", new Date(local("2026-10-21T17:00:00"))), null, "night runs until things close");
  assert.equal(dayPartMinutes("afternoon at 2pm", new Date(local("2026-10-21T14:00:00"))), null, "a clock time means no part limit");
});
