import assert from "node:assert/strict";
import { test } from "node:test";
import { decodePolyline } from "../src/lib/polyline.ts";
import { routeDrawing } from "../src/lib/transit.ts";
import type { Leg, Walk, WalkStop } from "../src/lib/types.ts";

// "_p~iF~ps|U_ulLnnqC" decodes to two points: (38.5, -120.2) → (40.7, -120.95).
const TWO_POINTS = "_p~iF~ps|U_ulLnnqC";

const walkWith = (legs: Array<Leg | null>): Walk => ({
  id: "w", prompt: "", title: "T", intro: "", outro: null, time_budget_minutes: null, start_lat: null, start_lng: null, total_minutes: null, created_at: "",
  stops: legs.map((leg, i) => ({ order: i + 1, kind: "place", item: {} as WalkStop["item"], why: "", arrive_at: "", leave_at: "", stay_minutes: 30, leg })),
});
const leg = (o: Partial<Leg>): Leg => ({ mode: "walk", duration_s: 600, distance_m: 700, polyline: TWO_POINTS, transit_lines: [], estimated: false, ...o });

test("a TTC leg with stops draws the walk to the stop dashed, the ride red, and pins where to board and get off", () => {
  const { lines, labels } = routeDrawing(
    walkWith([
      leg({
        mode: "transit",
        transit_lines: ["506"],
        segments: [
          { mode: "walk", duration_s: 360, distance_m: 450, polylines: [TWO_POINTS] },
          { mode: "transit", duration_s: 600, distance_m: 1900, polylines: [TWO_POINTS], line: "506", board: { name: "College St at Bay St", lat: 43.66, lng: -79.386 }, alight: { name: "Spadina", lat: 43.658, lng: -79.4 } },
        ],
      }),
    ]),
    decodePolyline,
  );
  assert.deepEqual(lines.map((l) => l.transit), [false, true], "only the ride is red");
  assert.deepEqual(labels.map((l) => [l.kind, l.text]), [["board", "Board 🚋 506"], ["alight", "Get off"]]);
  assert.deepEqual(labels[0].point, { latitude: 43.66, longitude: -79.386 }, "the board pin is on the stop");
});

test("older TTC legs without stops keep one red line with a halfway label", () => {
  const { lines, labels } = routeDrawing(walkWith([leg({ mode: "transit", transit_lines: ["506"] })]), decodePolyline);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].transit, true);
  assert.deepEqual(labels.map((l) => [l.kind, l.text]), [["ride", "🚋 506"]]);
});

test("walking legs are drawn without labels, and a stop with no leg is skipped", () => {
  const { lines, labels } = routeDrawing(walkWith([null, leg({})]), decodePolyline);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].transit, false);
  assert.equal(labels.length, 0);
});
