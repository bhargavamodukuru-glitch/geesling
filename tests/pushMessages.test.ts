import assert from "node:assert/strict";
import { test } from "node:test";
import { composeAlert, dueAlert } from "../supabase/functions/push-alerts/messages.ts";

const busy = { total: 78, free: 19, music: 37, new_day: 32, new_free_day: 9 };

test("morning alerts quote today's free count, with weekend and Friday versions", () => {
  assert.equal(composeAlert("morning", { ...busy, new_day: 5 }, 2).title, "☀️ Morning! 19 free things on today");
  assert.match(composeAlert("morning", { ...busy, new_day: 5 }, 2).body, /9 new free events since yesterday/);
  assert.equal(composeAlert("morning", busy, 6).title, "☀️ Saturday's wide open");
  assert.equal(composeAlert("morning", busy, 0).title, "☀️ Sunday's wide open");
  assert.match(composeAlert("morning", busy, 5).title, /Friday/);
  assert.equal(composeAlert("morning", { ...busy, free: 1 }, 2).title, "☕ Slow day in the city");
});

test("after-work alerts change with the day and the night's mix", () => {
  assert.equal(composeAlert("evening", busy, 4).title, "🍻 Almost Friday");
  assert.equal(composeAlert("evening", busy, 5).title, "🎉 You made it. Weekend starts now");
  assert.equal(composeAlert("evening", busy, 1).title, "🎶 37 shows on tonight");
  assert.equal(composeAlert("evening", { ...busy, music: 5 }, 1).title, "🌆 Clocking out? 19 free things tonight");
  assert.equal(composeAlert("evening", { ...busy, total: 2 }, 1).title, "🌙 Easy evening?");
});

test("a big batch of new events gets a line; a small one doesn't", () => {
  assert.match(composeAlert("evening", busy, 4).body, /\+ 32 new events added since yesterday/);
  assert.doesNotMatch(composeAlert("evening", { ...busy, new_day: 10 }, 4).body, /new events added/);
});

test("alerts open Geesling, tagged so a new one replaces the last", () => {
  const m = composeAlert("morning", busy, 2);
  assert.equal(m.url, "/?from=push-morning");
  assert.equal(m.tag, "geesling-morning");
});

test("which alert is due: morning 8–9 am daily, evening 5–6 pm on weekdays only", () => {
  assert.equal(dueAlert(8, 3), "morning");
  assert.equal(dueAlert(9, 0), "morning");
  assert.equal(dueAlert(7, 3), null);
  assert.equal(dueAlert(17, 1), "evening");
  assert.equal(dueAlert(18, 5), "evening");
  assert.equal(dueAlert(17, 6), null);
  assert.equal(dueAlert(17, 0), null);
  assert.equal(dueAlert(12, 2), null);
});
