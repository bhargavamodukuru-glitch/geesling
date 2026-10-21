import assert from "node:assert/strict";
import { test } from "node:test";
import { PAN_BOUNDS, TORONTO_BOUNDS, TORONTO_RING, TORONTO_SPAN, clampToPanArea, isInToronto, isViewInToronto, mentionsOtherPlace } from "../src/lib/area.ts";

test("places across the city count as Toronto", () => {
  assert.equal(isInToronto(43.6532, -79.3832), true, "downtown");
  assert.equal(isInToronto(43.72, -79.23), true, "Scarborough Bluffs");
  assert.equal(isInToronto(43.7175, -79.5976), true, "Woodbine Centre, the far west");
  assert.equal(isInToronto(43.8177, -79.1859), true, "Toronto Zoo, the far north-east");
  assert.equal(isInToronto(43.62, -79.38), true, "Toronto Islands");
});

test("other cities and countries do not", () => {
  assert.equal(isInToronto(45.4215, -75.6972), false, "Ottawa");
  assert.equal(isInToronto(43.2557, -79.8711), false, "Hamilton");
  assert.equal(isInToronto(44.3894, -79.6903), false, "Barrie");
  assert.equal(isInToronto(40.7128, -74.006), false, "New York");
  assert.equal(isInToronto(0, 0), false, "no location");
});

test("the Toronto box has sensible size (about 39 km by 49 km)", () => {
  assert.ok(TORONTO_SPAN.lat > 0.3 && TORONTO_SPAN.lat < 0.4);
  assert.ok(TORONTO_SPAN.lng > 0.5 && TORONTO_SPAN.lng < 0.65);
});

test("the real city limit excludes neighbours that sit inside the old box", () => {
  assert.equal(isInToronto(43.5890, -79.6441), false, "Mississauga, Square One");
  assert.equal(isInToronto(43.8561, -79.337), false, "Markham, north of Steeles");
  assert.equal(isInToronto(43.6897, -79.7624), false, "Brampton");
  assert.equal(isInToronto(43.677, -79.624), false, "Pearson Airport is in Mississauga");
  assert.equal(isInToronto(43.6, -79.35), false, "out in Lake Ontario");
  assert.equal(isInToronto(43.8, -79.4), true, "North York, Finch");
});

test("the boundary ring is a closed, plausible outline of the city", () => {
  assert.ok(TORONTO_RING.length > 100 && TORONTO_RING.length < 1000);
  for (const [lat, lng] of TORONTO_RING) {
    assert.ok(lat >= TORONTO_BOUNDS.south && lat <= TORONTO_BOUNDS.north, `lat ${lat}`);
    assert.ok(lng >= TORONTO_BOUNDS.west && lng <= TORONTO_BOUNDS.east, `lng ${lng}`);
  }
});

test("a view is in Toronto when its middle is", () => {
  assert.equal(isViewInToronto({ minLat: 43.6, maxLat: 43.7, minLng: -79.45, maxLng: -79.35 }), true);
  assert.equal(isViewInToronto({ minLat: 43.4, maxLat: 43.6, minLng: -79.9, maxLng: -79.7 }), false, "Mississauga and west");
  assert.equal(isViewInToronto({ minLat: 44.3, maxLat: 44.5, minLng: -79.8, maxLng: -79.6 }), false, "Barrie");
});

test("requests about other places are recognised, unless they also say Toronto", () => {
  assert.equal(mentionsOtherPlace("a date night in Mississauga"), true);
  assert.equal(mentionsOtherPlace("what is on in hamilton tonight"), true);
  assert.equal(mentionsOtherPlace("food in New York"), true);
  assert.equal(mentionsOtherPlace("coffee in Toronto, then the train to Hamilton"), false);
  assert.equal(mentionsOtherPlace("cheap dumplings downtown"), false);
  assert.equal(mentionsOtherPlace("a walk in London Fields park"), true, "known limit: London Fields is read as London, England");
});

test("the pan area extends past the city but not far", () => {
  assert.ok(PAN_BOUNDS.south < TORONTO_BOUNDS.south && PAN_BOUNDS.north > TORONTO_BOUNDS.north);
  assert.ok(PAN_BOUNDS.north - PAN_BOUNDS.south < 1);
});

test("clamping leaves a point inside the pan area alone", () => {
  assert.deepEqual(clampToPanArea(43.6532, -79.3832), { lat: 43.6532, lng: -79.3832 });
  assert.deepEqual(clampToPanArea(43.4, -79.8), { lat: 43.4, lng: -79.8 }, "outside the city but inside the pan area");
});

test("clamping pulls a point from far away back to the nearest edge", () => {
  assert.deepEqual(clampToPanArea(45.4215, -75.6972), { lat: PAN_BOUNDS.north, lng: PAN_BOUNDS.east }, "Ottawa");
  assert.deepEqual(clampToPanArea(43.7, -80.9), { lat: 43.7, lng: PAN_BOUNDS.west }, "due west keeps its latitude");
});
