// Whether a walk leaves most of the requested time empty. Pure and import-free (tests/fill.test.ts).

/** A walk shorter than this share of the time budget is sent back once to be filled out. */
export const MIN_FILL_SHARE = 0.6;

export function leavesTooMuchTime(walkMinutes: number, budgetMinutes: number | null, stopCount: number): boolean {
  if (budgetMinutes === null || budgetMinutes < 90) return false; // short outings are fine as they are
  if (stopCount >= 6) return false; // already a full walk
  return walkMinutes < budgetMinutes * MIN_FILL_SHARE;
}
