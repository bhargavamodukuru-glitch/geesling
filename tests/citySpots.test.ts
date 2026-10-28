import assert from "node:assert/strict";
import { test } from "node:test";
import { cafeTo, drinkingWater, fallColourBlocks, isFallColourTree, placeOfInterest, point, publicArt, text, titleCase, type Tree } from "../ingest/lib/citySpots.ts";

test("the portal's 'None' strings are empty, and coordinates come from geometry or columns inside Toronto only", () => {
  assert.equal(text("None"), null);
  assert.equal(text("  Queen  St  "), "Queen St");
  assert.deepEqual(point({ geometry: '{"type": "Point", "coordinates": [-79.39, 43.64]}' }), { lat: 43.64, lng: -79.39 });
  assert.deepEqual(point({ LATITUDE: "43.65", LONGITUDE: "-79.38" }, "LATITUDE", "LONGITUDE"), { lat: 43.65, lng: -79.38 });
  assert.equal(point({ geometry: '{"type": "Point", "coordinates": [-73.56, 45.5]}' }), null, "Montreal is not Toronto");
  assert.equal(point({ geometry: "not json" }), null);
});

test("public art reads as a free stop with its artist, and only web links are kept", () => {
  const art = publicArt({ FID: 7, TITLE: "18 Niches", ARTIST: "Ferrara, Jackie", ARTWORK_TYPE: "Sculpture", MEDIUM: "Brick", YEAR: "2003", DESCRIPTION: "None", ADDRESS: "81 Navy Wharf Court", LATITUDE: "43.641", LONGITUDE: "-79.3915", IMAGE_URL: "https://www.toronto.ca/a.jpg", ARTIST_WEBSITE: "javascript:alert(1)" });
  assert.equal(art?.id, "public-art:7");
  assert.equal(art?.description, "By Ferrara, Jackie. Sculpture, Brick, 2003.");
  assert.equal(art?.image_url, "https://www.toronto.ca/a.jpg");
  assert.equal(art?.website, null);
});

test("visitor centres and transit hubs aren't outing stops; dog-only fountains aren't for people", () => {
  const at = { geometry: '{"type": "Point", "coordinates": [-79.39, 43.64]}' };
  assert.equal(placeOfInterest({ ...at, NAME: "Union Station", CATEGORY: "Transportation" }), null);
  assert.equal(placeOfInterest({ ...at, NAME: "Casa Loma", CATEGORY: "Attraction" })?.kind, "landmark");
  assert.equal(drinkingWater({ ...at, ASSET_ID: 1, LOCATION: "Park", TYPE: "Dog Fountain", Status: 1 }), null);
  assert.equal(drinkingWater({ ...at, ASSET_ID: 2, LOCATION: "Park", TYPE: "Drinking Fountain", Status: 0 })?.details.working, false);
});

test("CaféTO patios are title-cased", () => {
  assert.equal(titleCase("99 BOTTLES"), "99 Bottles");
  assert.equal(titleCase("Mixed Case Stays"), "Mixed Case Stays");
  const patio = cafeTo({ geometry: '{"type": "Point", "coordinates": [-79.39, 43.64]}', OPERATOR_NAME: "AD CAFÉ", BUSINESS_ADDRESS: "1147 DAVENPORT RD", INTERVENTION_TYPE: "Sidewalk Café", LICENCE_NUMBER: "B123" });
  assert.equal(patio?.name, "Ad Café");
  assert.equal(patio?.address, "1147 Davenport Rd");
});

test("fall colours: maples, oaks and ginkgos count, Norway maples don't, and the densest blocks win", () => {
  assert.equal(isFallColourTree("Maple, sugar"), true);
  assert.equal(isFallColourTree("Ginkgo"), true);
  assert.equal(isFallColourTree("Maple, Norway"), false);
  assert.equal(isFallColourTree("Linden, littleleaf"), false);
  const block = (lat: number, n: number, species: string): Tree[] =>
    Array.from({ length: n }, (_, i) => ({ lat: lat + i * 1e-6, lng: -79.4, street: "BEECH AVE", crossStreet: "FIR AVE", species, trunkCm: 40 }));
  const spots = fallColourBlocks([...block(43.67, 30, "Maple, red"), ...block(43.70, 10, "Oak, red"), ...block(43.75, 26, "Serviceberry")], 5, 25);
  assert.equal(spots.length, 2, "the 10-tree block is too thin");
  assert.equal(spots[0].name, "Fall colours on Beech Ave near Fir Ave");
  assert.match(spots[0].description ?? "", /about 30 colour-turning street trees on this block, mostly maples/i);
  assert.match(spots[1].description ?? "", /serviceberries/);
});
