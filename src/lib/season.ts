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
