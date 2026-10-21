// Running requests: "I want to run a 15k", "10 mile run", "half marathon at 5:30/km". Pure and import-free (tests/run.test.ts).

export interface RunRequest {
  /** Target distance, km. */
  distanceKm: number;
  /** Running pace, minutes per km (default 6:00/km, an easy pace). */
  paceMinPerKm: number;
  /** Finish back where it started. */
  loop: boolean;
}

export const DEFAULT_PACE_MIN_PER_KM = 6;
const KM_PER_MILE = 1.609344;

/** How far off the target a route may be, either way. */
export const RUN_DISTANCE_TOLERANCE = 0.15;

/** A running request with a distance, or null for everything else ("5k people", "a 10 km walk" aren't runs). */
export function runRequest(prompt: string): RunRequest | null {
  const text = prompt.toLowerCase();
  const raceName = /\bhalf[- ]?marathon\b/.test(text) ? 21.1 : /\bmarathon\b/.test(text) ? 42.2 : null;
  // A running word, a race distance, a pace ("5:30/km"), or a distance loop ("10k loop") all mean a run.
  const hasPace = /\b\d{1,2}:[0-5]\d\s*(?:\/|per|a)?\s*(?:km|k|mi|mile)\b|\b\d{1,2}:[0-5]\d\s*(?:min(?:ute)?s?\s*)?pace\b/.test(text);
  const distanceLoop = /\b\d{1,2}(?:\.\d+)?\s*(?:k|km|mi|miles?)\s+loop\b/.test(text);
  const isRun = raceName !== null || hasPace || distanceLoop || /\b(run|runs|running|jog|jogging|runner|long run|tempo)\b/.test(text);
  if (!isRun) return null;

  let distanceKm = raceName;
  if (distanceKm === null) {
    const km = /\b(\d{1,2}(?:\.\d+)?)\s*(?:k|km|kms|kilometers?|kilometres?)\b/.exec(text);
    const miles = /\b(\d{1,2}(?:\.\d+)?)\s*(?:mi|miles?)\b/.exec(text);
    if (km) distanceKm = Number(km[1]);
    else if (miles) distanceKm = Number(miles[1]) * KM_PER_MILE;
  }
  if (distanceKm === null || !Number.isFinite(distanceKm) || distanceKm < 1 || distanceKm > 50) return null;

  let pace = DEFAULT_PACE_MIN_PER_KM;
  const perKm = /\b(\d{1,2}):([0-5]\d)\s*(?:\/|per|a)?\s*(?:km|k|kilometers?|kilometres?)\b|\b(\d{1,2}):([0-5]\d)\s*(?:min(?:ute)?s?\s*)?pace\b/.exec(text);
  const perMile = /\b(\d{1,2}):([0-5]\d)\s*(?:\/|per|a)?\s*(?:mi|mile)\b/.exec(text);
  if (perMile) pace = (Number(perMile[1]) + Number(perMile[2]) / 60) / KM_PER_MILE;
  else if (perKm) pace = Number(perKm[1] ?? perKm[3]) + Number(perKm[2] ?? perKm[4]) / 60;
  if (pace < 2.5 || pace > 12) pace = DEFAULT_PACE_MIN_PER_KM;

  const loop = /\b(loop|back to (?:the )?start|back where i started|out and back|out-and-back|round trip|circuit)\b/.test(text);
  return { distanceKm: Math.round(distanceKm * 10) / 10, paceMinPerKm: Math.round(pace * 100) / 100, loop };
}

/** Running time for a distance at a pace, seconds. */
export function runSeconds(meters: number, paceMinPerKm: number): number {
  return Math.round((meters / 1000) * paceMinPerKm * 60);
}

/** Whether a route's distance is close enough to the target. */
export function runDistanceFits(meters: number, targetKm: number): boolean {
  const km = meters / 1000;
  return Math.abs(km - targetKm) <= targetKm * RUN_DISTANCE_TOLERANCE;
}

/** "6:00/km" */
export function paceLabel(paceMinPerKm: number): string {
  const whole = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - whole) * 60);
  return seconds === 60 ? `${whole + 1}:00/km` : `${whole}:${String(seconds).padStart(2, "0")}/km`;
}
