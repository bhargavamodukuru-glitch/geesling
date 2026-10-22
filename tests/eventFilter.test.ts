import assert from "node:assert/strict";
import { test } from "node:test";
import { keepEvent } from "../src/lib/format.ts";
import type { EventFilters, EventItem } from "../src/lib/types.ts";

const filters = (o: Partial<EventFilters> = {}): EventFilters => ({ window: "now", date: null, freeOnly: false, paidOnly: false, drinksOnly: false, rsvpOnly: false, categories: [], ...o });
const event = (o: Partial<EventItem> = {}): EventItem => ({
  kind: "event", id: "e", source: "toronto", title: "Concert", description: null, categories: [], url: null, image_url: null, venue_name: null,
  address: null, lat: 43.65, lng: -79.38, is_free: false, price_min: 20, price_max: null, currency: "CAD", price_note: null, rsvp_required: false,
  rsvp_note: null, ticket_url: null, involves_alcohol: false, age_min: null, schedule_summary: null,
  next_start: "2027-01-21T00:00:00Z", next_end: "2027-01-21T02:00:00Z", is_live: false, ...o,
});
const jan20 = { from: new Date("2027-01-20T05:00:00Z"), to: new Date("2027-01-21T05:00:00Z") };

test("a picked date shows that day's events even though the time window is still Now", () => {
  assert.equal(keepEvent(event(), filters({ date: "2027-01-20" }), jan20.from, jan20.to), true, "90 days ahead, not live");
});

test("without a date, Now still means live events only", () => {
  const now = { from: new Date("2027-01-21T00:30:00Z"), to: new Date("2027-01-21T00:31:00Z") };
  assert.equal(keepEvent(event(), filters(), now.from, now.to), false);
  assert.equal(keepEvent(event({ is_live: true }), filters(), now.from, now.to), true);
});

test("events outside the picked day, and other filters, still apply", () => {
  assert.equal(keepEvent(event({ next_start: "2027-01-22T00:00:00Z", next_end: "2027-01-22T02:00:00Z" }), filters({ date: "2027-01-20" }), jan20.from, jan20.to), false);
  assert.equal(keepEvent(event({ is_free: true }), filters({ date: "2027-01-20", paidOnly: true }), jan20.from, jan20.to), false);
});
