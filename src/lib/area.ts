// Where Geesling has event listings. Pure and import-free so it can be unit-tested under plain Node.

/** Rough box around the Toronto area; the same box the event ingest uses (ingest/lib/classify.ts isInToronto). */
export function isInEventArea(lat: number, lng: number): boolean {
  return lat > 43.4 && lat < 44.0 && lng > -79.9 && lng < -79.0;
}
