// Google Routes API — walking legs, with TTC transit for longer hops.
// https://developers.google.com/maps/documentation/routes/compute_route_directions

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Leg {
  mode: "walk" | "transit";
  duration_s: number;
  distance_m: number;
  polyline: string | null; // Google encoded polyline
  transit_lines: string[]; // e.g. ["504 King", "Line 1"]
  estimated: boolean; // true when computed without the Routes API
}

const TRANSIT_THRESHOLD_M = 1800;
const WALK_SPEED_M_PER_MIN = 80;

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Encodes a straight line as a Google polyline so the client draws every leg the same way. */
function encodePolyline(points: LatLng[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = "";
  const encode = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = "";
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return chunk + String.fromCharCode(v + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += encode(lat - lastLat) + encode(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out;
}

export function estimateLeg(from: LatLng, to: LatLng): Leg {
  const distance = haversineMeters(from, to) * 1.3; // street grid detour factor
  return {
    mode: "walk",
    duration_s: Math.round((distance / WALK_SPEED_M_PER_MIN) * 60),
    distance_m: Math.round(distance),
    polyline: encodePolyline([from, to]),
    transit_lines: [],
    estimated: true,
  };
}

interface RoutesResponse {
  routes?: Array<{
    duration?: string; // "1234s"
    distanceMeters?: number;
    polyline?: { encodedPolyline?: string };
    legs?: Array<{
      steps?: Array<{
        travelMode?: string;
        transitDetails?: { transitLine?: { nameShort?: string; name?: string; vehicle?: { type?: string } } };
      }>;
    }>;
  }>;
}

async function computeRoute(apiKey: string, from: LatLng, to: LatLng, mode: "WALK" | "TRANSIT", departAt: Date): Promise<Leg | null> {
  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: mode,
    languageCode: "en-CA",
    units: "METRIC",
  };
  if (mode === "TRANSIT" && departAt.getTime() > Date.now()) body.departureTime = departAt.toISOString();
  const fieldMask =
    mode === "TRANSIT"
      ? "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.transitDetails.transitLine"
      : "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline";
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error(`Routes ${mode} failed: ${response.status} ${await response.text()}`);
    return null;
  }
  const data = (await response.json()) as RoutesResponse;
  const route = data.routes?.[0];
  if (!route?.duration) return null;
  const lines = new Set<string>();
  for (const step of route.legs?.flatMap((l) => l.steps ?? []) ?? []) {
    const line = step.transitDetails?.transitLine;
    if (step.travelMode === "TRANSIT" && line) lines.add(line.nameShort || line.name || "TTC");
  }
  return {
    mode: mode === "TRANSIT" ? "transit" : "walk",
    duration_s: Number(route.duration.replace("s", "")),
    distance_m: route.distanceMeters ?? Math.round(haversineMeters(from, to)),
    polyline: route.polyline?.encodedPolyline ?? null,
    transit_lines: [...lines],
    estimated: false,
  };
}

/**
 * Best way between two stops: walk, or TTC when the hop is long and transit is meaningfully faster.
 * `allowTransit: false` is the "I'm walking" choice: the leg is always a walk, however long it is.
 */
export async function bestLeg(apiKey: string | null, from: LatLng, to: LatLng, departAt: Date, allowTransit = true): Promise<Leg> {
  if (!apiKey) return estimateLeg(from, to);
  const walk = (await computeRoute(apiKey, from, to, "WALK", departAt)) ?? estimateLeg(from, to);
  if (!allowTransit || walk.distance_m <= TRANSIT_THRESHOLD_M) return walk;
  const transit = await computeRoute(apiKey, from, to, "TRANSIT", departAt);
  if (transit && transit.transit_lines.length > 0 && transit.duration_s < walk.duration_s * 0.8) return transit;
  return walk;
}
