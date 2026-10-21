// Friendly names, step-by-step directions and map drawing for TTC rides. Pure with type-only imports (tests/transit.test.ts).
// Google gives the short name only; TTC numbering tells subway, streetcar and bus apart.
import type { Coordinate } from "./polyline";
import type { Leg, Walk } from "./types";

export type TransitKind = "subway" | "streetcar" | "bus" | "train";

export const TRANSIT_ICON: Record<TransitKind, string> = { subway: "🚇", streetcar: "🚋", bus: "🚌", train: "🚆" };

export function transitKind(line: string): TransitKind {
  const name = line.trim();
  if (/\b(via|go|up express|rail|train)\b/i.test(name)) return "train";
  if (/^line\s*\d$/i.test(name)) return "subway";
  const number = Number.parseInt(name, 10);
  if (Number.isNaN(number)) return "bus";
  if (number >= 1 && number <= 6) return "subway"; // Lines 1, 2, 4, 5 and 6
  if (number >= 500 && number <= 599) return "streetcar"; // 501–512, including branches like "504C"
  return "bus";
}

/** "🚋 506 streetcar", "🚇 Line 2", "🚌 32 bus", "🚆 VIA Rail". */
export function transitLabel(line: string): string {
  const kind = transitKind(line);
  const name = line.trim();
  if (kind === "subway") return `${TRANSIT_ICON.subway} Line ${name.replace(/^line\s*/i, "")}`;
  if (kind === "train") return `${TRANSIT_ICON.train} ${name}`;
  return `${TRANSIT_ICON[kind]} ${name} ${kind}`;
}

/** Short label for a map chip: one icon and number per line, joined with arrows ("🚋 506 → 🚇 1"). */
export function legChip(lines: string[]): string {
  if (!lines.length) return `${TRANSIT_ICON.bus} TTC`;
  return lines.map((line) => `${TRANSIT_ICON[transitKind(line)]} ${line.trim().replace(/^line\s*/i, "")}`).join(" → ");
}

/** Google's headsign names the whole route ("Yonge-University to Vaughan Metropolitan Centre Station"); people need the end of it. */
export function towardName(headsign: string): string {
  const parts = headsign.split(/\s+to\s+/i);
  return parts[parts.length - 1].trim() || headsign;
}

const mins = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`;

/**
 * Step-by-step directions for a TTC leg, e.g.
 * "🦶 Walk 6 min to College St at Bay St" → "🚋 Board the 506 streetcar toward Main Street Station · 5 stops · get off at Spadina Ave".
 * Empty when the leg has no saved segments (walks saved before they were added).
 */
export function transitSteps(leg: Leg): string[] {
  const segments = leg.segments ?? [];
  const steps: string[] = [];
  segments.forEach((segment, i) => {
    if (segment.mode === "walk") {
      if (segment.duration_s < 30) return;
      const next = segments.slice(i + 1).find((s) => s.mode === "transit");
      const sawRide = segments.slice(0, i).some((s) => s.mode === "transit");
      if (next?.board) steps.push(`🦶 Walk ${mins(segment.duration_s)} to ${sawRide ? "transfer at " : ""}${next.board.name}`);
      else steps.push(`🦶 Walk ${mins(segment.duration_s)} the rest of the way`);
      return;
    }
    const line = segment.line ?? "TTC";
    const kind = transitKind(line);
    const name = kind === "subway" ? `Line ${line.replace(/^line\s*/i, "")}` : kind === "train" ? line : `${line} ${kind}`;
    const parts = [`${TRANSIT_ICON[kind]} Board the ${name}${segment.board ? ` at ${segment.board.name}` : ""}`];
    if (segment.headsign) parts[0] += ` toward ${towardName(segment.headsign)}`;
    if (segment.stop_count) parts.push(`${segment.stop_count} stop${segment.stop_count === 1 ? "" : "s"}`);
    if (segment.alight) parts.push(`get off at ${segment.alight.name}`);
    steps.push(parts.join(" · "));
  });
  return steps;
}

// What to draw for a walk's route: lines (dashed walking, solid red TTC) and the TTC labels. Used by both maps.

export interface RouteLine {
  key: string;
  points: Coordinate[];
  transit: boolean;
}

export interface RouteLabel {
  key: string;
  point: Coordinate;
  text: string;
  /** "board" and "alight" sit on a stop; "ride" is the older halfway label for legs without stops. */
  kind: "board" | "alight" | "ride";
}

/**
 * What to draw for a walk's route. `decode` is the polyline decoder (src/lib/polyline.ts), passed in so this file
 * stays import-free for the plain-Node tests.
 */
export function routeDrawing(walk: Walk | null, decode: (encoded: string) => Coordinate[]): { lines: RouteLine[]; labels: RouteLabel[] } {
  const lines: RouteLine[] = [];
  const labels: RouteLabel[] = [];
  for (const stop of walk?.stops ?? []) {
    const leg = stop.leg;
    if (!leg) continue;
    const key = `leg-${stop.order}`;
    if (leg.mode === "transit" && leg.segments?.length) {
      // Walk to the stop dashed, the ride red, and a pin where to board and where to get off.
      leg.segments.forEach((segment, i) => {
        const points = segment.polylines.flatMap((p) => decode(p));
        if (points.length > 1) lines.push({ key: `${key}-${i}`, points, transit: segment.mode === "transit" });
        if (segment.mode !== "transit") return;
        const icon = TRANSIT_ICON[transitKind(segment.line ?? "TTC")];
        const line = (segment.line ?? "TTC").replace(/^line\s*/i, "");
        const board = segment.board ? { latitude: segment.board.lat, longitude: segment.board.lng } : points[0];
        const alight = segment.alight ? { latitude: segment.alight.lat, longitude: segment.alight.lng } : points[points.length - 1];
        if (board) labels.push({ key: `${key}-${i}-board`, point: board, text: `Board ${icon} ${line}`, kind: "board" });
        if (alight) labels.push({ key: `${key}-${i}-alight`, point: alight, text: "Get off", kind: "alight" });
      });
      continue;
    }
    if (!leg.polyline) continue;
    const points = decode(leg.polyline);
    lines.push({ key, points, transit: leg.mode === "transit" });
    if (leg.mode === "transit" && points.length) {
      labels.push({ key: `${key}-ride`, point: points[Math.floor(points.length / 2)], text: legChip(leg.transit_lines), kind: "ride" });
    }
  }
  return { lines, labels };
}
