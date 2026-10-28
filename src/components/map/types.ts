import type { Bounds, MapItem, Walk } from "@/lib/types";

export interface CityMapProps {
  items: MapItem[];
  walk: Walk | null;
  selectedId: string | null;
  userLocation: { lat: number; lng: number } | null;
  /** Bumped to recenter the camera on the user's location or the active walk. */
  focusKey: number;
  onSelect: (item: MapItem | null) => void;
  onBoundsChange: (bounds: Bounds) => void;
  /** Space covered at the bottom (the menu), so the map's logo, legal link and controls stay above it. */
  bottomInset?: number;
}

export const TORONTO = { lat: 43.6532, lng: -79.3832 };
export const DEFAULT_DELTA = { latitudeDelta: 0.06, longitudeDelta: 0.06 };

export function walkFocusBounds(walk: Walk, user: { lat: number; lng: number } | null): Bounds | null {
  const points = walk.stops.map((s) => ({ lat: s.item.lat, lng: s.item.lng }));
  // Keep TTC boarding stops in view: the first one can be well before stop 1.
  for (const segment of walk.stops.slice(1).flatMap((s) => s.leg?.segments ?? [])) { // routes start at stop 1
    if (segment.board) points.push({ lat: segment.board.lat, lng: segment.board.lng });
  }
  if (user) points.push(user);
  if (points.length === 0) return null;
  return {
    minLat: Math.min(...points.map((p) => p.lat)),
    maxLat: Math.max(...points.map((p) => p.lat)),
    minLng: Math.min(...points.map((p) => p.lng)),
    maxLng: Math.max(...points.map((p) => p.lng)),
  };
}
