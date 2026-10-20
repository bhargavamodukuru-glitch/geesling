// Geesling covers Toronto only. Pure and import-free so it can be unit-tested under plain Node.

/**
 * A box around the City of Toronto with a small margin (Steeles Ave to the lake, Etobicoke to the Rouge).
 * It is a rectangle, so it also takes in slivers of neighbouring cities at the edges.
 */
export const TORONTO_BOUNDS = { south: 43.55, north: 43.9, west: -79.67, east: -79.09 };

export const TORONTO_SPAN = {
  lat: TORONTO_BOUNDS.north - TORONTO_BOUNDS.south,
  lng: TORONTO_BOUNDS.east - TORONTO_BOUNDS.west,
};

export function isInToronto(lat: number, lng: number): boolean {
  return lat >= TORONTO_BOUNDS.south && lat <= TORONTO_BOUNDS.north && lng >= TORONTO_BOUNDS.west && lng <= TORONTO_BOUNDS.east;
}

/** The nearest point inside Toronto; a point already inside comes back unchanged. */
export function clampToToronto(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Math.min(TORONTO_BOUNDS.north, Math.max(TORONTO_BOUNDS.south, lat)),
    lng: Math.min(TORONTO_BOUNDS.east, Math.max(TORONTO_BOUNDS.west, lng)),
  };
}
