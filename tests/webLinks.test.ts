import assert from "node:assert/strict";
import { test } from "node:test";
import { webUrl, withWebLinks } from "../ingest/lib/url.ts";
import type { NormalizedEvent } from "../ingest/lib/types.ts";
import { webLink } from "../src/lib/socialLinks.ts";

const BAD = ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<b>x</b>", "intent://x#Intent;end", "geesling://walk/abc", "www.example.com", "not a url", "", null, undefined];

test("only absolute http(s) links survive, in ingest and in the app", () => {
  for (const check of [webUrl, webLink]) {
    assert.equal(check("https://www.ticketmaster.ca/event/123"), "https://www.ticketmaster.ca/event/123");
    assert.equal(check(" http://example.com/a?b=1 "), "http://example.com/a?b=1", "trimmed");
    assert.equal(check("HTTPS://Example.com"), "https://example.com/", "scheme and host are case-insensitive");
    for (const value of BAD) assert.equal(check(value), null, String(value));
  }
});

test("ingest clears unsafe links on every event before saving", () => {
  const event = { url: "javascript:alert(1)", ticket_url: "https://tickets.example.com/x", image_url: "data:image/png;base64,AAAA" } as NormalizedEvent;
  const safe = withWebLinks(event);
  assert.equal(safe.url, null);
  assert.equal(safe.ticket_url, "https://tickets.example.com/x");
  assert.equal(safe.image_url, null);
});
