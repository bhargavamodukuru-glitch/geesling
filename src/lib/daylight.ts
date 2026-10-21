// Whether it is night in Toronto right now, from real sunrise and sunset. Pure and import-free (tests/daylight.test.ts).
// Sun position from the standard NOAA/SunCalc approximation; accurate to a minute or two, plenty for a backdrop.

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const TORONTO = { lat: 43.6532, lng: -79.3832 };

const toJulian = (d: Date) => d.getTime() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);

/** Sunrise and sunset on the solar day nearest `date`, at the given place. */
export function sunTimes(date: Date, lat = TORONTO.lat, lng = TORONTO.lng): { sunrise: Date; sunset: Date } {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const n = Math.round(toJulian(date) - J2000 - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(RAD * 23.4397));
  const transit = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const h0 = RAD * -0.833; // sun's upper edge on the horizon, with refraction
  const w = Math.acos((Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const set = J2000 + 0.0009 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return { sunrise: fromJulian(transit - (set - transit)), sunset: fromJulian(set) };
}

/** Noon today in Toronto (within an hour across daylight saving), so the right day's sunrise and sunset are used. */
function torontoNoon(now: Date): Date {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${key}T12:00:00-05:00`);
}

/** True between sunset and the next sunrise in Toronto. */
export function isNight(now: Date): boolean {
  const { sunrise, sunset } = sunTimes(torontoNoon(now));
  return now.getTime() < sunrise.getTime() || now.getTime() >= sunset.getTime();
}
