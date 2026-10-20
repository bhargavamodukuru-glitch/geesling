import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { bestLeg } from "../supabase/functions/geesling/routes.ts";

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
