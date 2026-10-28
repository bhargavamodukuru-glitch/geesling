// Seasonal looks that switch themselves on and off. Pure and import-free (tests/season.test.ts).

/** Halloween week in Toronto: October 20 to 31, through Halloween night. */
export function isHalloweenSeason(now: Date): boolean {
  const [month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "numeric", day: "numeric" })
    .formatToParts(now)
    .filter((p) => p.type === "month" || p.type === "day")
    .map((p) => Number(p.value));
  return month === 10 && day >= 20;
}

/** Set once per load: the whole app wears the Halloween look while it's on. */
export const HALLOWEEN = isHalloweenSeason(new Date());

/** Fall colours in Toronto: about September 20 to November 15 (matches supabase/functions/geesling/city.ts). */
export function isFallColourSeason(now: Date): boolean {
  const [month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "numeric", day: "numeric" })
    .formatToParts(now)
    .filter((p) => p.type === "month" || p.type === "day")
    .map((p) => Number(p.value));
  return (month === 9 && day >= 20) || month === 10 || (month === 11 && day <= 15);
}

/** Set once per load, like HALLOWEEN. */
export const FALL_COLOURS = isFallColourSeason(new Date());
