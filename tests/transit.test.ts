import assert from "node:assert/strict";
import { test } from "node:test";
import { legChip, towardName, transitKind, transitLabel, transitSteps } from "../src/lib/transit.ts";
import type { Leg } from "../src/lib/types.ts";

test("TTC numbering tells subway, streetcar and bus apart", () => {
  assert.equal(transitKind("2"), "subway");
  assert.equal(transitKind("Line 1"), "subway");
  assert.equal(transitKind("506"), "streetcar");
  assert.equal(transitKind("504C"), "streetcar", "a branch is still a streetcar");
  assert.equal(transitKind("32"), "bus");
  assert.equal(transitKind("73D"), "bus");
  assert.equal(transitKind("320"), "bus", "night buses");
  assert.equal(transitKind("902"), "bus", "express buses");
  assert.equal(transitKind("VIA Rail"), "train");
});

test("labels read like people say them", () => {
  assert.equal(transitLabel("506"), "🚋 506 streetcar");
  assert.equal(transitLabel("2"), "🚇 Line 2");
  assert.equal(transitLabel("32"), "🚌 32 bus");
  assert.equal(transitLabel("VIA Rail"), "🚆 VIA Rail");
});

test("map chips are short and show transfers in order", () => {
  assert.equal(legChip(["506"]), "🚋 506");
  assert.equal(legChip(["506", "1"]), "🚋 506 → 🚇 1");
  assert.equal(legChip([]), "🚌 TTC");
});

const stop = (name: string) => ({ name, lat: 43.66, lng: -79.39 });
const leg = (segments: Leg["segments"]): Leg => ({ mode: "transit", duration_s: 1200, distance_m: 2500, polyline: null, transit_lines: ["506"], estimated: false, segments });

test("a TTC leg reads as walk to the stop, ride with direction and stops, then walk the rest", () => {
  const steps = transitSteps(
    leg([
      { mode: "walk", duration_s: 360, distance_m: 450, polylines: [] },
      { mode: "transit", duration_s: 600, distance_m: 1900, polylines: [], line: "506", headsign: "Main Street Station", stop_count: 5, board: stop("College St at Bay St"), alight: stop("College St at Spadina Ave") },
      { mode: "walk", duration_s: 180, distance_m: 200, polylines: [] },
    ]),
  );
  assert.deepEqual(steps, [
    "🦶 Walk 6 min to College St at Bay St",
    "🚋 Board the 506 streetcar at College St at Bay St toward Main Street Station · 5 stops · get off at College St at Spadina Ave",
    "🦶 Walk 3 min the rest of the way",
  ]);
});

test("a transfer walk says so, and subway rides say Line", () => {
  const steps = transitSteps(
    leg([
      { mode: "transit", duration_s: 300, distance_m: 1000, polylines: [], line: "506", headsign: null, stop_count: 1, board: stop("A"), alight: stop("College Station") },
      { mode: "walk", duration_s: 120, distance_m: 100, polylines: [] },
      { mode: "transit", duration_s: 300, distance_m: 2000, polylines: [], line: "1", headsign: "Finch", stop_count: 3, board: stop("College Station"), alight: stop("Union Station") },
    ]),
  );
  assert.equal(steps[0], "🚋 Board the 506 streetcar at A · 1 stop · get off at College Station");
  assert.equal(steps[1], "🦶 Walk 2 min to transfer at College Station");
  assert.equal(steps[2], "🚇 Board the Line 1 at College Station toward Finch · 3 stops · get off at Union Station");
});

test("old walks without segments get no steps, and tiny walks are skipped", () => {
  assert.deepEqual(transitSteps(leg(undefined)), []);
  assert.deepEqual(transitSteps(leg([{ mode: "walk", duration_s: 10, distance_m: 5, polylines: [] }])), []);
});

test("the direction is the end of the route, as on the front of the vehicle", () => {
  assert.equal(towardName("Yonge-University to Vaughan Metropolitan Centre Station"), "Vaughan Metropolitan Centre Station");
  assert.equal(towardName("Spadina to Spadina Stn"), "Spadina Stn");
  assert.equal(towardName("Main Street Station"), "Main Street Station");
});
