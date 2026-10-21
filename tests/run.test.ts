import assert from "node:assert/strict";
import { test } from "node:test";
import { paceLabel, runDistanceFits, runRequest, runSeconds } from "../supabase/functions/geesling/run.ts";

test("a runner's request reads its distance", () => {
  assert.deepEqual(runRequest("I want to run a 15k, suggest a route through the city"), { distanceKm: 15, paceMinPerKm: 6, loop: false });
  assert.equal(runRequest("10 km run along the water")?.distanceKm, 10);
  assert.equal(runRequest("easy 5k jog")?.distanceKm, 5);
  assert.equal(runRequest("10 mile long run")?.distanceKm, 16.1);
  assert.equal(runRequest("half marathon training route")?.distanceKm, 21.1);
  assert.equal(runRequest("marathon route")?.distanceKm, 42.2);
});

test("pace and loops are optional", () => {
  assert.equal(runRequest("run a 10k at 5:30/km")?.paceMinPerKm, 5.5);
  assert.equal(runRequest("run 8k, 4:45 pace")?.paceMinPerKm, 4.75);
  assert.equal(runRequest("run 5 miles at 8:00 per mile")?.paceMinPerKm, 4.97);
  assert.equal(runRequest("run a 12k loop")?.loop, true);
  assert.equal(runRequest("10k run, out and back")?.loop, true);
  assert.equal(runRequest("run a 10k at 0:30/km")?.paceMinPerKm, 6, "nonsense pace falls back to easy");
});

test("a pace or a distance loop means a run even without the word", () => {
  assert.deepEqual(runRequest("10k loop at 5:30/km, start near the CN Tower"), { distanceKm: 10, paceMinPerKm: 5.5, loop: true });
  assert.equal(runRequest("8k loop around high park")?.loop, true);
  assert.equal(runRequest("12 km at 5:00/km")?.distanceKm, 12);
});

test("other requests aren't runs", () => {
  assert.equal(runRequest("a 5k fun walk"), null, "no running word");
  assert.equal(runRequest("dinner for 2, run by a great chef"), null, "no distance");
  assert.equal(runRequest("cheap dumplings"), null);
  assert.equal(runRequest("run a 100k ultra"), null, "too far for one city route");
});

test("running times, distance tolerance and pace labels", () => {
  assert.equal(runSeconds(15000, 6), 5400, "15 km at 6:00/km is 1 h 30");
  assert.equal(runDistanceFits(14000, 15), true, "within 15%");
  assert.equal(runDistanceFits(11000, 15), false);
  assert.equal(paceLabel(6), "6:00/km");
  assert.equal(paceLabel(5.5), "5:30/km");
  assert.equal(paceLabel(4.97), "4:58/km");
});
