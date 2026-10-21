import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { bestLeg, transitSegments } from "../supabase/functions/geesling/routes.ts";

const FROM = { lat: 43.6709, lng: -79.3939 };
const TO = { lat: 43.6487, lng: -79.3854 };
const DEPART = new Date("2026-10-20T20:00:00Z");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stands in for Google Routes: a 3 km hop that takes 40 min on foot or 15 min on the 504. */
function mockRoutes(options: { walkMeters?: number; transitSeconds?: number } = {}) {
  const calls: string[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const mode = (JSON.parse(String(init?.body)) as { travelMode: string }).travelMode;
    calls.push(mode);
    const body =
      mode === "TRANSIT"
        ? {
            routes: [
              {
                duration: `${options.transitSeconds ?? 900}s`,
                distanceMeters: 3000,
                polyline: { encodedPolyline: "_p~iF~ps|U" },
                legs: [{ steps: [{ travelMode: "TRANSIT", transitDetails: { transitLine: { nameShort: "504" } } }] }],
              },
            ],
          }
        : { routes: [{ duration: "2400s", distanceMeters: options.walkMeters ?? 3000, polyline: { encodedPolyline: "_p~iF~ps|U" } }] };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return calls;
}

test("a long hop uses the TTC when it is much faster and transit is allowed", async () => {
  const calls = mockRoutes();
  const leg = await bestLeg("key", FROM, TO, DEPART);
  assert.equal(leg.mode, "transit");
  assert.deepEqual(leg.transit_lines, ["504"]);
  assert.deepEqual(calls, ["WALK", "TRANSIT"]);
});

test("choosing walking keeps a long hop on foot and never asks for transit", async () => {
  const calls = mockRoutes();
  const leg = await bestLeg("key", FROM, TO, DEPART, false);
  assert.equal(leg.mode, "walk");
  assert.equal(leg.duration_s, 2400);
  assert.deepEqual(calls, ["WALK"]);
});

test("short hops stay on foot without a transit lookup", async () => {
  const calls = mockRoutes({ walkMeters: 900 });
  const leg = await bestLeg("key", FROM, TO, DEPART);
  assert.equal(leg.mode, "walk");
  assert.deepEqual(calls, ["WALK"]);
});

test("transit that is not clearly faster does not replace the walk", async () => {
  mockRoutes({ transitSeconds: 2300 });
  assert.equal((await bestLeg("key", FROM, TO, DEPART)).mode, "walk");
});

test("without a routing key the leg is an honest estimate on foot", async () => {
  const calls = mockRoutes();
  const leg = await bestLeg(null, FROM, TO, DEPART);
  assert.equal(leg.mode, "walk");
  assert.equal(leg.estimated, true);
  assert.deepEqual(calls, []);
});

test("a transit route's steps become a walk to the stop, the ride, and the walk after", () => {
  const segments = transitSegments([
    { travelMode: "WALK", staticDuration: "200s", distanceMeters: 250, polyline: { encodedPolyline: "a" } },
    { travelMode: "WALK", staticDuration: "160s", distanceMeters: 200, polyline: { encodedPolyline: "b" } },
    {
      travelMode: "TRANSIT",
      staticDuration: "600s",
      distanceMeters: 1900,
      polyline: { encodedPolyline: "c" },
      transitDetails: {
        transitLine: { nameShort: "506" },
        headsign: "Main Street Station",
        stopCount: 5,
        stopDetails: {
          departureStop: { name: "College St at Bay St", location: { latLng: { latitude: 43.66, longitude: -79.386 } } },
          arrivalStop: { name: "College St at Spadina Ave", location: { latLng: { latitude: 43.658, longitude: -79.4 } } },
          departureTime: "2026-10-21T16:05:00Z",
        },
      },
    },
    { travelMode: "WALK", staticDuration: "180s", distanceMeters: 200, polyline: { encodedPolyline: "d" } },
  ]);
  assert.equal(segments.length, 3);
  assert.deepEqual(segments[0], { mode: "walk", duration_s: 360, distance_m: 450, polylines: ["a", "b"] }, "consecutive walking steps merge");
  assert.equal(segments[1].line, "506");
  assert.equal(segments[1].board?.name, "College St at Bay St");
  assert.equal(segments[1].alight?.name, "College St at Spadina Ave");
  assert.equal(segments[1].stop_count, 5);
  assert.equal(segments[2].mode, "walk");
});

test("a ride with missing stop details still keeps the line", () => {
  const [ride] = transitSegments([{ travelMode: "TRANSIT", staticDuration: "300s", transitDetails: { transitLine: { name: "Line 1 Yonge-University" } } }]);
  assert.equal(ride.line, "Line 1 Yonge-University");
  assert.equal(ride.board, null);
});

test("every Routes request is counted, by mode, so the Costs tab can track the free allowance", async () => {
  mockRoutes();
  const counted: string[] = [];
  await bestLeg("key", FROM, TO, DEPART, true, (mode) => counted.push(mode));
  assert.deepEqual(counted, ["walk", "transit"]);
  const short: string[] = [];
  mockRoutes({ walkMeters: 900 });
  await bestLeg("key", FROM, TO, DEPART, true, (mode) => short.push(mode));
  assert.deepEqual(short, ["walk"], "a short hop makes one request");
});
