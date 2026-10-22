import assert from "node:assert/strict";
import { test } from "node:test";
import { costLine, eventTime, formatDuration, summarizePlan, travelLine } from "../src/lib/planSummary.ts";
import type { EventItem, Leg, PlaceItem, Walk, WalkStop } from "../src/lib/types.ts";

const event = (o: Partial<EventItem> = {}): EventItem => ({
  kind: "event", id: "e1", source: "toronto", title: "Free Night at the Museum", description: null, categories: [], url: null,
  image_url: null, venue_name: null, address: null, lat: 43.66, lng: -79.39, is_free: false, price_min: null, price_max: null,
  currency: "CAD", price_note: null, rsvp_required: false, rsvp_note: null, ticket_url: null, involves_alcohol: false, age_min: null,
  schedule_summary: null, next_start: "2026-10-20T22:00:00Z", next_end: "2026-10-21T01:00:00Z", is_live: false, ...o,
});
const place = (o: Partial<PlaceItem> = {}): PlaceItem => ({
  kind: "place", id: "p1", name: "The Cups", primary_type: "cafe", types: [], address: null, lat: 43.65, lng: -79.4, price_level: null,
  is_free: false, involves_alcohol: false, rating: 4.6, rating_count: 120, website: null, maps_url: null, summary: null, open_now: null,
  hours: null, ...o,
});
const leg = (o: Partial<Leg> = {}): Leg => ({ mode: "walk", duration_s: 600, distance_m: 700, polyline: null, transit_lines: [], estimated: false, ...o });
const stop = (order: number, item: EventItem | PlaceItem, o: Partial<WalkStop> = {}): WalkStop => ({
  order, kind: item.kind, item, why: "", arrive_at: "2026-10-20T22:00:00Z", leave_at: "2026-10-20T22:30:00Z", stay_minutes: 30, leg: leg(), ...o,
});
const walk = (stops: WalkStop[], total: number | null = null): Walk => ({
  id: "w1", prompt: "", title: "T", intro: "", outro: null, time_budget_minutes: null, start_lat: null, start_lng: null, stops,
  total_minutes: total, created_at: "2026-10-20T20:00:00Z",
});

test("time adds up travel and time at stops", () => {
  const s = summarizePlan(walk([stop(1, place(), { stay_minutes: 30, leg: leg({ duration_s: 360 }) }), stop(2, place({ id: "p2" }), { stay_minutes: 20, leg: leg({ duration_s: 1020 }) })], 76));
  assert.equal(s.travelMinutes, 23);
  assert.equal(s.stopMinutes, 50);
  assert.equal(s.totalMinutes, 76);
  assert.equal(s.waitMinutes, 0, "a 3-minute gap (76 total vs 73 busy) is not worth mentioning");
});

test("a long gap before an event is reported as waiting for doors", () => {
  const s = summarizePlan(walk([stop(1, place(), { stay_minutes: 30, leg: leg({ duration_s: 600 }) })], 100));
  assert.equal(s.waitMinutes, 60);
});

test("with no server total, the total is travel plus time at stops", () => {
  const s = summarizePlan(walk([stop(1, place(), { stay_minutes: 45, leg: leg({ duration_s: 900 }) })], null));
  assert.equal(s.totalMinutes, 60);
});

test("free stops cost nothing and a plan of only free stops says Free", () => {
  const s = summarizePlan(walk([stop(1, event({ is_free: true })), stop(2, place({ id: "p2", is_free: true }))]));
  assert.equal(s.cost.freeStops, 2);
  assert.equal(costLine(s.cost), "Free");
});

test("listed ticket prices are summed as a range, per person", () => {
  const s = summarizePlan(walk([stop(1, event({ price_min: 15, price_max: 25 })), stop(2, event({ id: "e2", price_min: 10, price_max: null }))]));
  assert.equal(s.cost.knownMin, 25);
  assert.equal(s.cost.knownMax, 35);
  assert.equal(costLine(s.cost), "$25–$35 per person");
});

test("price levels are never turned into dollar amounts", () => {
  const s = summarizePlan(walk([stop(1, place({ price_level: "PRICE_LEVEL_MODERATE" })), stop(2, event({ price_min: null }))]));
  assert.equal(s.cost.knownMax, 0);
  assert.equal(s.cost.unknownStops, 2);
  assert.equal(costLine(s.cost), "Price not listed: 2 stops with no listed price");
});

test("known prices and unknown stops are both stated", () => {
  const s = summarizePlan(walk([stop(1, event({ price_min: 12, price_max: 12 })), stop(2, place({ price_level: "PRICE_LEVEL_INEXPENSIVE" })), stop(3, event({ id: "e3", is_free: true }))]));
  assert.equal(costLine(s.cost), "$12 per person · 1 stop with no listed price");
});

test("only events that need a ticket or RSVP are listed under booking", () => {
  const s = summarizePlan(walk([stop(1, event({ rsvp_required: true })), stop(2, place()), stop(3, event({ id: "e3", title: "Walk-in show", rsvp_required: false }))]));
  assert.deepEqual(s.bookAhead, ["Free Night at the Museum"]);
});

test("travel wording reflects walking, TTC and approximate legs", () => {
  const walking = summarizePlan(walk([stop(1, place(), { leg: leg({ duration_s: 1200 }) })], 60));
  assert.equal(travelLine(walking), "20 min travelling (walking)");
  const mixed = summarizePlan(walk([stop(1, place(), { leg: leg({ mode: "transit", duration_s: 900, estimated: true }) })], 60));
  assert.equal(travelLine(mixed), "15 min travelling (walking + TTC), approx.");
  assert.equal(travelLine(summarizePlan(walk([stop(1, place(), { leg: null })], 30))), "No travel between stops");
});

test("durations read naturally", () => {
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(60), "1 h");
  assert.equal(formatDuration(123), "2 h 3 min");
  assert.equal(formatDuration(-5), "0 min");
});

test("a place's Google price range counts as a listed price", () => {
  const s = summarizePlan(walk([stop(1, place({ price_from: 10, price_to: 20 })), stop(2, event({ id: "e2", price_min: 5 }))]));
  assert.equal(s.cost.pricedStops, 2);
  assert.equal(costLine(s.cost), "$15–$25 per person");
});

test("an open-ended place range makes the total a floor", () => {
  const s = summarizePlan(walk([stop(1, place({ price_from: 100, price_to: null }))]));
  assert.equal(costLine(s.cost), "$100+ per person");
});

test("a $$ level alone is still not turned into a dollar amount", () => {
  const s = summarizePlan(walk([stop(1, place({ price_level: "PRICE_LEVEL_MODERATE" }))]));
  assert.equal(s.cost.unknownStops, 1);
});

test("an event stop says when it ends and how long you get after travelling there", () => {
  const atSeven = (o: Partial<WalkStop>) => stop(1, event({ next_start: "2026-10-22T21:00:00Z", next_end: "2026-10-22T23:00:00Z" }), o);
  const fine = eventTime(atSeven({ arrive_at: "2026-10-22T21:30:00Z" }))!;
  assert.equal(fine.minutesLeft, 90);
  assert.equal(fine.tight, false);
  const tight = eventTime(atSeven({ arrive_at: "2026-10-22T22:55:00Z" }))!;
  assert.deepEqual([tight.minutesLeft, tight.tight, tight.ended], [5, true, false], "6:55 for a 7:00 end");
  const ended = eventTime(atSeven({ arrive_at: "2026-10-22T23:10:00Z" }))!;
  assert.deepEqual([ended.tight, ended.ended], [false, true]);
  assert.equal(eventTime(stop(1, place())), null, "places have no end time");
});
