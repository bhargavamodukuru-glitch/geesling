import assert from "node:assert/strict";
import { test } from "node:test";
import { cityForModel, citySpotToPlace, hasPatio, isFallColourSeason, tooDarkForLeaves, usableCitySpot, type CitySpotRow } from "../supabase/functions/geesling/city.ts";

const row = (over: Partial<CitySpotRow>): CitySpotRow => ({ id: "public-art:1", source: "public-art", kind: "art", name: "Mural", description: "By someone.", address: "1 Queen St W", lat: 43.65, lng: -79.38, website: null, image_url: null, details: {}, ...over });

test("city spots become free places the route can use, with a city: id", () => {
  const p = citySpotToPlace(row({}));
  assert.equal(p.id, "city:public-art:1");
  assert.equal(p.kind, "place");
  assert.equal(p.is_free, true);
  assert.equal(p.source, "city");
  assert.equal(citySpotToPlace(row({ kind: "patio" })).is_free, false, "a café costs what you order");
  assert.equal(citySpotToPlace(row({ kind: "landmark", details: { category: "Museum" } })).is_free, false, "museums charge entry");
  assert.equal(citySpotToPlace(row({ kind: "landmark", details: { category: "Featured Park" } })).is_free, true);
});

test("the model sees a short description and no empty extras; switched-off water is dropped", () => {
  const view = cityForModel(citySpotToPlace(row({ details: { artist: "A", year: null, species: [] } })), row({ details: { artist: "A", year: null, species: [] }, distance_m: 412.6 }));
  assert.deepEqual(view.details, { artist: "A" });
  assert.equal(view.distance_m, 413);
  assert.equal(usableCitySpot(row({ kind: "water", details: { working: false } })), false);
  assert.equal(usableCitySpot(row({ kind: "water", details: { working: true } })), true);
});

test("a Google place gets the patio badge from a CaféTO licence at its address or under its name, close by", () => {
  const place = { name: "Bar Raval", address: "505 College St, Toronto, ON M6G 1A4", lat: 43.6557, lng: -79.4096 };
  assert.equal(hasPatio(place, [{ name: "BAR RAVAL INC", address: "505 COLLEGE ST", lat: 43.6557, lng: -79.4097 }]), true);
  assert.equal(hasPatio(place, [{ name: "Someone Else", address: "505 College St", lat: 43.6558, lng: -79.4096 }]), true, "same address");
  assert.equal(hasPatio(place, [{ name: "Bar Raval", address: "1 King St", lat: 43.70, lng: -79.40 }]), false, "same name far away");
  assert.equal(hasPatio(place, [{ name: "Cafe X", address: "507 College St", lat: 43.6557, lng: -79.4097 }]), false, "the neighbour's patio");
});

test("the guide's fall colours season matches the app's", () => {
  assert.equal(isFallColourSeason(new Date("2026-10-27T12:00:00-04:00")), true);
  assert.equal(isFallColourSeason(new Date("2026-12-01T12:00:00-05:00")), false);
});

test("leaves don't show after dark: 6 pm to 7 am counts as dark", () => {
  assert.equal(tooDarkForLeaves(new Date("2026-10-27T14:00:00-04:00")), false);
  assert.equal(tooDarkForLeaves(new Date("2026-10-27T18:30:00-04:00")), true);
  assert.equal(tooDarkForLeaves(new Date("2026-10-28T06:30:00-04:00")), true);
});
