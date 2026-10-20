import assert from "node:assert/strict";
import { test } from "node:test";
import { isInEventArea } from "../src/lib/area.ts";
import { isTopRated } from "../src/lib/placeBadges.ts";
import type { EventItem, PlaceItem } from "../src/lib/types.ts";

const place = (o: Partial<PlaceItem> = {}): PlaceItem => ({
  kind: "place", id: "p1", name: "Honeymoon Dessert", primary_type: "dessert_shop", types: [], address: null, lat: 43.65, lng: -79.4,
  price_level: null, is_free: false, involves_alcohol: false, rating: 4.7, rating_count: 120, website: null, maps_url: null, summary: null,
  open_now: null, hours: null, ...o,
});

test("a place rated above 4.5 with enough reviews gets the star", () => {
  assert.equal(isTopRated(place({ rating: 4.6, rating_count: 20 })), true);
  assert.equal(isTopRated(place({ rating: 5, rating_count: 300 })), true);
});

test("4.5 exactly is not above 4.5", () => {
  assert.equal(isTopRated(place({ rating: 4.5, rating_count: 500 })), false);
});

test("a near-perfect rating from a handful of reviews does not get the star", () => {
  assert.equal(isTopRated(place({ rating: 5, rating_count: 3 })), false);
  assert.equal(isTopRated(place({ rating: 4.9, rating_count: 19 })), false);
  assert.equal(isTopRated(place({ rating: 4.9, rating_count: null })), false);
});

test("a place without a rating, and any event, never gets the star", () => {
  assert.equal(isTopRated(place({ rating: null, rating_count: null })), false);
  const event = { kind: "event", rating: 5, rating_count: 999 } as unknown as EventItem;
  assert.equal(isTopRated(event), false);
});

test("the event area covers Toronto and the nearby cities, and nothing far away", () => {
  assert.equal(isInEventArea(43.6532, -79.3832), true, "downtown Toronto");
  assert.equal(isInEventArea(43.5890, -79.6441), true, "Mississauga");
  assert.equal(isInEventArea(45.4215, -75.6972), false, "Ottawa");
  assert.equal(isInEventArea(40.7128, -74.006), false, "New York");
  assert.equal(isInEventArea(0, 0), false, "no location");
});
