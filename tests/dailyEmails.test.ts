import assert from "node:assert/strict";
import { test } from "node:test";
import { composeEvening, composeMorning, composeNeighbourhood, composeWelcome, dueEmail, pickLiveEvents, inToronto, pickFreeEvents, spendRange, whenLabel, NEIGHBOURHOODS, type EventRow, type PlaceRow } from "../supabase/functions/daily-emails/picks.ts";
import { escapeHtml, renderEmail } from "../supabase/functions/daily-emails/template.ts";

const now = new Date("2026-11-05T14:00:00Z"); // 9 am Toronto
const midnight = new Date("2026-11-06T04:59:59Z");
const ev = (over: Partial<EventRow>): EventRow => ({
  title: "Show",
  venue_name: "The Image Centre",
  address: "33 Gould St, Toronto",
  lat: 43.6577,
  lng: -79.3788,
  is_free: true,
  price_min: null,
  categories: ["arts_culture"],
  quality_score: 80,
  schedule: [{ start: "2026-11-05T16:00:00Z", end: "2026-11-05T23:00:00Z" }],
  ...over,
});
const place = (name: string, price: [number, number] | null = [10, 20]): PlaceRow => ({ name, address: "1 King St W", rating: 4.6, reviews: 1234, price, kindLabel: "Restaurant" });

test("today's picks skip programmes, out-of-season and out-of-city listings, one per category", () => {
  const picks = pickFreeEvents(
    [
      ev({ title: "Youth Entrepreneurship Program", quality_score: 99 }),
      ev({ title: "CandyForKids Halloween Candy Drive", quality_score: 98, categories: ["community"] }),
      ev({ title: "Cheer Classic", venue_name: "Mississauga Sports & Entertainment Centre", quality_score: 97, categories: ["sports"] }),
      ev({ title: "Avedon portraits", quality_score: 90 }),
      ev({ title: "Another gallery show", quality_score: 89 }),
      ev({ title: "Free film night", categories: ["film"], quality_score: 70 }),
      ev({ title: "Yesterday's thing", schedule: [{ start: "2026-11-04T16:00:00Z", end: "2026-11-04T20:00:00Z" }] }),
    ],
    now,
    midnight,
    11,
  );
  // One per category first, then a second gallery show fills a slot.
  assert.deepEqual(picks.map((p) => p.e.title), ["Avedon portraits", "Free film night", "Another gallery show"]);
});

test("Toronto check: inside the city box and not naming a neighbouring city", () => {
  assert.equal(inToronto(ev({})), true);
  assert.equal(inToronto(ev({ venue_name: "Pickering Town Centre" })), false);
  assert.equal(inToronto(ev({ lat: 43.5, lng: -79.7 })), false);
});

test("times read naturally in Toronto time", () => {
  assert.equal(whenLabel({ start: new Date("2026-11-05T13:00:00Z"), end: new Date("2026-11-05T23:00:00Z") }, now), "until 6 pm");
  assert.equal(whenLabel({ start: new Date("2026-11-06T00:00:00Z"), end: new Date("2026-11-06T02:00:00Z") }, now), "7 pm");
  assert.equal(whenLabel({ start: new Date("2026-11-06T02:30:00Z"), end: new Date("2026-11-06T04:00:00Z") }, now), "9:30 pm");
});

test("spend is a range from Google's price ranges", () => {
  assert.equal(spendRange([place("Coffee", [1, 10]), place("Lunch", [10, 20])]), "about $11–30");
  assert.equal(spendRange([place("Coffee", [1, 10]), place("Bakery", [1, 10])]), "up to $20");
  assert.equal(spendRange([place("No price", null)]), null);
});

test("the three emails come out with the right subject, sections and Plan button", () => {
  const morning = composeMorning({ dateLabel: "Thu, Nov 5 · 9 AM", freeCount: 27, picks: pickFreeEvents([ev({ title: "Avedon portraits" })], now, midnight, 11), now });
  assert.equal(morning.subject, "☀️ 27 free things on today in Toronto");
  assert.equal(morning.sections[0].items[0].tag?.text, "FREE");
  assert.match(morning.cta.url, /^https:\/\/geesling\.ca\/\?ask=.+&from=email-morning$/);

  const ronces = NEIGHBOURHOODS[0];
  const hood = composeNeighbourhood({
    dateLabel: "Thu, Nov 5 · NOON",
    area: ronces,
    budget: 20,
    coffee: place("Cherry Bomb Coffee", [1, 10]),
    lunch: place("Souv Like", [10, 20]),
    freeSpots: [{ kind: "fall_colours", name: "Fall colours on Parkside Dr near High Park Blvd", address: "Parkside Dr at High Park Blvd" }],
    freeEvents: [],
    extra: { e: ev({ title: "V for Vendetta", is_free: false, venue_name: "Revue Cinema" }), when: { start: new Date("2026-11-06T02:30:00Z"), end: new Date("2026-11-06T05:00:00Z") } },
    now,
  });
  assert.equal(hood.subject, "🗺️ A day in Roncesvalles under $20");
  assert.deepEqual(hood.sections[0].items.map((i) => i.step), [1, 2, 3, 4]);
  assert.equal(hood.sections[0].items[1].title, "Fall colours walk on Parkside Dr near High Park Blvd");
  assert.equal(hood.sections[0].items[3].tag?.text, "TICKET EXTRA");
  assert.deepEqual(hood.total, { label: "Coffee + lunch,", value: "about $11–30" });

  const evening = composeEvening({ dateLabel: "Thu, Nov 5 · 5 PM", areaName: "downtown", bites: [place("Big Pita")], dinner: [], coffee: [place("Daily Dose", [1, 10])] });
  assert.deepEqual(evening.sections.map((s) => s.heading), ["Quick bites", "Coffee to go"]);
  assert.match(evening.attribution ?? "", /Google Maps/);
});

test("rendered email: accessible HTML, escaped text, unsubscribe and contact in both parts", () => {
  const content = composeMorning({ dateLabel: "Thu, Nov 5 · 9 AM", freeCount: 3, picks: pickFreeEvents([ev({ title: "Tom & Jerry <live>" })], now, midnight, 11), now });
  const { html, text } = renderEmail(content, "https://example.test/unsub?u=1&t=abc");
  assert.match(html, /<html lang="en"/);
  assert.match(html, /role="presentation"/);
  assert.match(html, /<img src="https:\/\/geesling\.ca\/email-skyline\.png"[^>]*alt=""/); // decorative scene
  assert.match(html, /Tom &amp; Jerry &lt;live&gt;/);
  assert.doesNotMatch(html, /<live>/);
  assert.match(html, /Unsubscribe from Geesling emails/);
  assert.match(html, /geeslingthegoose@outlook\.com/);
  assert.doesNotMatch(html, /mailing address/i);
  assert.match(text, /Unsubscribe: https:\/\/example\.test\/unsub\?u=1&t=abc/);
  assert.match(text, /Tom & Jerry <live> \[FREE\]/);
  assert.equal(escapeHtml(`"a"&'b'`), "&quot;a&quot;&amp;&#39;b&#39;");
});

test("which email is due: 9–10 am, noon–1 pm, 5–6 pm Toronto", () => {
  assert.equal(dueEmail(9), "morning");
  assert.equal(dueEmail(13), "neighbourhood");
  assert.equal(dueEmail(18), "evening");
  assert.equal(dueEmail(8), null);
  assert.equal(dueEmail(20), null);
});

test("thank-you events: on now first, then starting soon, then later; three at most", () => {
  // now = 9 am Toronto (14:00Z); midnight = end of the day.
  const picks = pickLiveEvents(
    [
      ev({ title: "Tonight's big show", categories: ["music"], quality_score: 99, schedule: [{ start: "2026-11-06T01:00:00Z", end: "2026-11-06T03:00:00Z" }] }),
      ev({ title: "Gallery on now", categories: ["gallery"], quality_score: 60, schedule: [{ start: "2026-11-05T13:00:00Z", end: "2026-11-05T23:00:00Z" }] }),
      ev({ title: "Brunch market soon", categories: ["market"], quality_score: 70, is_free: false, price_min: 5, schedule: [{ start: "2026-11-05T16:00:00Z", end: "2026-11-05T19:00:00Z" }] }),
      ev({ title: "Season Pass", categories: ["sports"], quality_score: 100 }),
      ev({ title: "Koto Fall Beginner Class 1", categories: ["arts_culture"], quality_score: 100, is_free: false, price_min: 276 }),
      ev({ title: "Pricey gala", categories: ["nightlife"], quality_score: 100, is_free: false, price_min: 85 }),
      ev({ title: "Runs into tomorrow", categories: ["film"], quality_score: 100, schedule: [{ start: "2026-11-05T13:00:00Z", end: "2026-11-06T16:30:00Z" }] }),
      ev({ title: "Yesterday", schedule: [{ start: "2026-11-04T13:00:00Z", end: "2026-11-04T23:00:00Z" }] }),
    ],
    now,
    midnight,
    11,
  );
  assert.deepEqual(picks.map((p) => p.e.title), ["Gallery on now", "Brunch market soon", "Tonight's big show"]);
});

test("the thank-you is a short note, live events with on-now/starts labels, and one button to geesling.ca", () => {
  const picks = pickLiveEvents(
    [
      ev({ title: "Gallery on now", schedule: [{ start: "2026-11-05T13:00:00Z", end: "2026-11-05T23:00:00Z" }] }),
      ev({ title: "Jazz", categories: ["music"], is_free: false, price_min: 12.5, schedule: [{ start: "2026-11-06T00:00:00Z", end: "2026-11-06T02:00:00Z" }] }),
    ],
    now,
    midnight,
    11,
  );
  const w = composeWelcome({ dateText: "Thu, Nov 5", picks, now });
  assert.equal(w.subject, "🪿 Thanks for joining Geesling!");
  assert.equal(w.hero?.title, "Thanks for joining Geesling!");
  assert.equal(w.dateLabel, "Thu, Nov 5 · WELCOME");
  assert.deepEqual(w.sections[0].items.map((i) => [i.title, i.detail, i.tag?.text]), [
    ["Gallery on now", "The Image Centre · on now · until 6 pm", "FREE"],
    ["Jazz", "The Image Centre · starts 7 pm", "from $13"],
  ]);
  assert.equal(w.cta.label, "See more on geesling.ca");
  assert.equal(w.cta.url, "https://geesling.ca/?from=email-welcome");
  assert.equal(w.singleButton, true);
  const { html } = renderEmail(w, "https://example.test/u");
  assert.doesNotMatch(html, /Open the live map/);
});
