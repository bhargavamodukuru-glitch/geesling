import assert from "node:assert/strict";
import { test } from "node:test";
import { isHalloweenSeason } from "../src/lib/season.ts";

test("the Halloween look runs from October 20 to Halloween night in Toronto", () => {
  assert.equal(isHalloweenSeason(new Date("2026-10-19T12:00:00-04:00")), false, "Oct 19");
  assert.equal(isHalloweenSeason(new Date("2026-10-20T00:30:00-04:00")), true, "Oct 20 just after midnight");
  assert.equal(isHalloweenSeason(new Date("2026-10-31T23:30:00-04:00")), true, "Halloween night");
  assert.equal(isHalloweenSeason(new Date("2026-11-01T00:30:00-04:00")), false, "Nov 1");
  assert.equal(isHalloweenSeason(new Date("2026-11-01T02:00:00Z")), true, "10 pm Oct 31 in Toronto is already Nov 1 in UTC");
  assert.equal(isHalloweenSeason(new Date("2027-06-25T12:00:00-04:00")), false, "June");
});
