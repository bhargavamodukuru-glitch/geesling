import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanEmail, cleanPhone } from "../src/lib/profile.ts";

test("emails are trimmed and lower-cased, and junk is refused", () => {
  assert.equal(cleanEmail("  Me@Example.com "), "me@example.com");
  assert.equal(cleanEmail("me@example"), null);
  assert.equal(cleanEmail("not an email"), null);
  assert.equal(cleanEmail(""), null);
});

test("phone numbers are normalised to +digits, with 10 digits taken as Canada/US", () => {
  assert.equal(cleanPhone("(416) 555-0199"), "+14165550199");
  assert.equal(cleanPhone("1 416 555 0199"), "+14165550199");
  assert.equal(cleanPhone("+44 20 7946 0958"), "+442079460958");
  assert.equal(cleanPhone("555-0199"), null);
  assert.equal(cleanPhone("+1"), null);
});

