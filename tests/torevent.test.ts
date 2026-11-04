import assert from "node:assert/strict";
import { test } from "node:test";
import { addressQueries, locateVenues, memoryCache, venueKey } from "../ingest/lib/geocode.ts";
import { ageFromLabels, normalizeTorevent, parseToreventFile, toreventCategories, type ToreventEvent } from "../ingest/sources/torevent.ts";

const now = new Date("2026-11-04T12:00:00Z");
const config = { now, horizonDays: 365 };
const sample: ToreventEvent = {
  id: "TKF/abc/1",
  start: "2026-11-04T23:30:00Z",
  end: "2026-11-05T01:30:00Z",
  isAllDay: false,
  title: " We Really Like Her!: GREASE 2 (1982) ",
  venue: "Revue Cinema",
  location: "Revue Cinema,400 Roncesvalles Ave, Toronto, ON M6R 2M9, Canada",
  categories: ["Film", "Revue-Cinema"],
  labels: ["19+"],
  image: null,
  url: "https://tockify.com/torevent/detail/23712/1793835000000",
  actionUrl: "",
  externalLinks: ["javascript:alert(1)", "https://revuecinema.ca/calendar/"],
  description: "Tickets: Revue https://revuecinema.ca/calendar/",
};

test("events.js is read from its window.TOREVENT_DATA wrapper", () => {
  const file = `window.TOREVENT_DATA = ${JSON.stringify({ stamp: 1, events: [sample] })};\n`;
  assert.equal(parseToreventFile(file)[0].id, "TKF/abc/1");
  assert.throws(() => parseToreventFile("<html>"), /unexpected/);
});

test("torevent categories and age labels map onto Geesling's", () => {
  assert.deepEqual(toreventCategories(["Concert", "Massey-Hall"]), ["music"]);
  assert.deepEqual(toreventCategories(["Dance---Performance---Theatre"]), ["theatre", "arts_culture"]);
  assert.deepEqual(toreventCategories(["DJ/Club/Rave"]), ["nightlife", "music"]);
  assert.equal(ageFromLabels(["19+", "No cover"]), 19);
  assert.equal(ageFromLabels(["All ages"]), null);
});

test("a listing becomes an event linked to the original page", () => {
  const event = normalizeTorevent(sample, { lat: 43.65, lng: -79.45 }, config);
  assert.ok(event);
  assert.equal(event.source, "torevent");
  assert.equal(event.title, "We Really Like Her!: GREASE 2 (1982)");
  assert.equal(event.address, "400 Roncesvalles Ave, Toronto, ON M6R 2M9");
  assert.equal(event.ticket_url, "https://revuecinema.ca/calendar/");
  assert.equal(event.url, "https://revuecinema.ca/calendar/");
  assert.ok(event.categories.includes("film"));
  assert.equal(event.age_min, 19);
  assert.equal(event.involves_alcohol, true);
  assert.equal(event.is_free, false);
  assert.equal(event.first_start_at, "2026-11-04T23:30:00.000Z");
});

test("free, no-cover and pay-what-you-can labels set the price", () => {
  assert.equal(normalizeTorevent({ ...sample, labels: ["No cover"] }, { lat: 43.65, lng: -79.45 }, config)?.is_free, true);
  assert.equal(normalizeTorevent({ ...sample, labels: ["PWYC"] }, { lat: 43.65, lng: -79.45 }, config)?.price_note, "Pay what you can");
});

test("past events are dropped", () => {
  assert.equal(normalizeTorevent({ ...sample, start: "2026-10-01T23:00:00Z", end: "2026-10-02T01:00:00Z" }, { lat: 43.65, lng: -79.45 }, config), null);
});

test("address searches try the street first, then the venue's name", () => {
  assert.deepEqual(addressQueries(sample.location!, "Revue Cinema"), ["400 Roncesvalles Ave, Toronto, ON M6R 2M9", "Revue Cinema, Toronto"]);
  assert.deepEqual(addressQueries("Online", "Online"), ["Online, Toronto"]);
  assert.deepEqual(addressQueries("Pix Film Gallery,1411 Dufferin St Unit B, Toronto, ON M6H 4C7, Canada", "Pix Film Gallery"), [
    "1411 Dufferin St Unit B, Toronto, ON M6H 4C7",
    "1411 Dufferin St, Toronto, ON M6H 4C7",
    "Pix Film Gallery, Toronto",
  ]);
  assert.equal(venueKey(" Revue Cinema , 400  Roncesvalles "), "revue cinema,400 roncesvalles");
});

test("cached venues are used without a lookup, and recent misses aren't retried", async () => {
  const cache = memoryCache([
    { key: venueKey("A,1 King St W, Toronto"), lat: 43.6, lng: -79.4, looked_up_at: "2026-10-01T00:00:00Z" },
    { key: venueKey("B,nowhere"), lat: null, lng: null, looked_up_at: "2026-11-01T00:00:00Z" },
  ]);
  const result = await locateVenues([{ location: "A,1 King St W, Toronto", venue: "A" }, { location: "B,nowhere", venue: "B" }], cache, now);
  assert.equal(result.lookups, 0);
  assert.equal(result.missing, 1);
  assert.deepEqual(result.found.get(venueKey("A,1 King St W, Toronto")), { lat: 43.6, lng: -79.4 });
  assert.equal(cache.fresh.length, 0);
});
