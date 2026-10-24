// The goose's follow-up questions for vague requests ("running route" → 5k, 10k, 15k or Other). Pure (tests/choices.test.ts).

/** A question with tappable answers. The guide sends it instead of a route when the request is too vague to plan well. */
export interface Choices {
  /** The tappable answers, e.g. ["5k", "10k", "15k"]. "Other" is always added by the app. */
  options: string[];
  /** The request the question is about; an answer is added to it so the guide gets the whole thing. */
  base: string;
  /** Placeholder for the text box when they pick Other. */
  other: string;
  /** Added to a bare number typed under Other ("8" → "8 km"). */
  unit?: string | null;
}

/** The request sent once they answer: "running route — 10k", or "running route — 8 km" for a typed 8. */
export function answerPrompt(choices: Choices, answer: string): string {
  const trimmed = answer.trim();
  const withUnit = choices.unit && /^\d+(\.\d+)?$/.test(trimmed) ? `${trimmed} ${choices.unit}` : trimmed;
  return `${choices.base} — ${withUnit}`;
}

/** Choices from the guide's reply, or null when it's missing or malformed. */
export function readChoices(value: unknown): Choices | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const options = Array.isArray(v.options) ? v.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").slice(0, 4) : [];
  if (!options.length || typeof v.base !== "string") return null;
  return { options, base: v.base, other: typeof v.other === "string" ? v.other : "Tell me more…", unit: typeof v.unit === "string" ? v.unit : null };
}
