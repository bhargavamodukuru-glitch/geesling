import assert from "node:assert/strict";
import { test } from "node:test";
import { isNight, sunTimes } from "../src/lib/daylight.ts";

const toronto = (iso: string, offset = "-04:00") => new Date(`${iso}${offset}`);
const clock = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const minutesApart = (a: string, b: string) => {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
};

test("Toronto sunrise and sunset match a published table within a few minutes", () => {
  // r-astro.com/toronto/2026-10-24: sunrise 07:44, sunset 18:18.
  const oct = sunTimes(toronto("2026-10-24T12:00:00"));
  assert.ok(minutesApart(clock(oct.sunrise), "07:44") <= 4, `Oct sunrise ${clock(oct.sunrise)}`);
  assert.ok(minutesApart(clock(oct.sunset), "18:18") <= 4, `Oct sunset ${clock(oct.sunset)}`);
});

test("the seasons look right: long June evenings, early December dark", () => {
  const jun = sunTimes(toronto("2026-06-21T12:00:00"));
  assert.ok(clock(jun.sunset) > "20:45" && clock(jun.sunrise) < "06:00", `June ${clock(jun.sunrise)}–${clock(jun.sunset)}`);
  const dec = sunTimes(toronto("2026-12-21T12:00:00", "-05:00"));
  assert.ok(clock(dec.sunset) < "17:00" && clock(dec.sunrise) > "07:30", `December ${clock(dec.sunrise)}–${clock(dec.sunset)}`);
});

test("night is from sunset to sunrise, across midnight", () => {
  assert.equal(isNight(toronto("2026-10-20T12:00:00")), false, "noon");
  assert.equal(isNight(toronto("2026-10-20T18:00:00")), false, "before sunset");
  assert.equal(isNight(toronto("2026-10-20T19:00:00")), true, "after sunset");
  assert.equal(isNight(toronto("2026-10-20T23:30:00")), true, "late evening");
  assert.equal(isNight(toronto("2026-10-21T03:00:00")), true, "small hours");
  assert.equal(isNight(toronto("2026-10-21T07:00:00")), true, "before sunrise");
  assert.equal(isNight(toronto("2026-10-21T08:00:00")), false, "after sunrise");
  assert.equal(isNight(toronto("2026-06-21T20:30:00")), false, "a June evening is still light");
  assert.equal(isNight(toronto("2026-12-21T17:00:00", "-05:00")), true, "a December evening is dark");
});
