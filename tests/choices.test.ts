import assert from "node:assert/strict";
import { test } from "node:test";
import { answerPrompt, readChoices } from "../src/lib/choices.ts";

const RUN = { options: ["5k", "10k", "15k"], base: "running route", other: "How far, or anything else?", unit: "km" };

test("an answer is added to the original request", () => {
  assert.equal(answerPrompt(RUN, "10k"), "running route — 10k");
  assert.equal(answerPrompt(RUN, " along the lake, about 8k "), "running route — along the lake, about 8k");
});

test("a bare number typed under Other gets the unit", () => {
  assert.equal(answerPrompt(RUN, "8"), "running route — 8 km");
  assert.equal(answerPrompt(RUN, "21.1"), "running route — 21.1 km");
  assert.equal(answerPrompt({ ...RUN, unit: null }, "8"), "running route — 8");
});

test("choices from the guide are checked", () => {
  assert.deepEqual(readChoices(RUN), RUN);
  assert.equal(readChoices(null), null);
  assert.equal(readChoices({ options: [], base: "x" }), null, "no options");
  assert.equal(readChoices({ options: ["a"] }), null, "no base");
  assert.equal(readChoices({ options: ["a", "b", "c", "d", "e"], base: "x" })?.options.length, 4, "at most four");
});
