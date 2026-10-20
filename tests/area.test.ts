import assert from "node:assert/strict";
import { test } from "node:test";
import { TORONTO_BOUNDS, TORONTO_SPAN, clampToToronto, isInToronto } from "../src/lib/area.ts";

test("places across the city count as Toronto", () => {
  assert.equal(isInToronto(43.6532, -79.3832), true, "downtown");
  assert.equal(isInToronto(43.7, -79.23), true, "Scarborough Bluffs");
  assert.equal(isInToronto(43.677, -79.624), true, "Pearson Airport, the far west");
  assert.equal(isInToronto(43.82, -79.14), true, "Rouge, the far north-east");
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

test("clamping leaves a point inside Toronto alone", () => {
  assert.deepEqual(clampToToronto(43.6532, -79.3832), { lat: 43.6532, lng: -79.3832 });
});

test("clamping pulls a point from outside back to the nearest edge", () => {
  assert.deepEqual(clampToToronto(45.4215, -75.6972), { lat: TORONTO_BOUNDS.north, lng: TORONTO_BOUNDS.east }, "Ottawa");
  assert.deepEqual(clampToToronto(43.2557, -79.8711), { lat: TORONTO_BOUNDS.south, lng: TORONTO_BOUNDS.west }, "Hamilton");
  assert.deepEqual(clampToToronto(43.7, -80.5), { lat: 43.7, lng: TORONTO_BOUNDS.west }, "due west keeps its latitude");
  assert.equal(isInToronto(clampToToronto(10, 10).lat, clampToToronto(10, 10).lng), true);
});
