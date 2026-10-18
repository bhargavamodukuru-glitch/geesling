import type { Bounds, MapItem, Walk } from "@/lib/types";

export interface CityMapProps {
  items: MapItem[];
  walk: Walk | null;
  selectedId: string | null;
  userLocation: { lat: number; lng: number } | null;
  /** Bumped to recenter the camera on the user (Near me) or the walk. */
  focusKey: number;
  onSelect: (item: MapItem | null) => void;
  onBoundsChange: (bounds: Bounds) => void;
}

export const TORONTO = { lat: 43.6532, lng: -79.3832 };
export const DEFAULT_DELTA = { latitudeDelta: 0.06, longitudeDelta: 0.06 };

export function walkFocusBounds(walk: Walk, user: { lat: number; lng: number } | null): Bounds | null {
  const points = walk.stops.map((s) => ({ lat: s.item.lat, lng: s.item.lng }));
  if (user) points.push(user);
  if (points.length === 0) return null;
  return {
    minLat: Math.min(...points.map((p) => p.lat)),
    maxLat: Math.max(...points.map((p) => p.lat)),
    minLng: Math.min(...points.map((p) => p.lng)),
    maxLng: Math.max(...points.map((p) => p.lng)),
  };
}
