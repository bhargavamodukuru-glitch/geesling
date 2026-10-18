import * as Linking from "expo-linking";
import { Platform, Share } from "react-native";
import type { MapItem, Walk } from "./types";

export function walkUrl(walk: Walk): string {
  const site = process.env.EXPO_PUBLIC_SITE_URL;
  if (site) return `${site.replace(/\/$/, "")}/walk/${walk.id}`;
  return Linking.createURL(`/walk/${walk.id}`);
}

/** Opens turn-by-turn directions in Apple Maps (iOS) or Google Maps (Android, web). */
export function openDirections(item: MapItem, transit = false): void {
  const { lat, lng } = item;
  if (Platform.OS === "ios") {
    void Linking.openURL(`maps://?daddr=${lat},${lng}&dirflg=${transit ? "r" : "w"}`);
    return;
  }
  void Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${transit ? "transit" : "walking"}`,
  );
}

/** Whole walk as a Google Maps multi-stop route (works on every platform). */
export function openWalkInMaps(walk: Walk): void {
  const points = walk.stops.map((s) => `${s.item.lat},${s.item.lng}`);
  if (points.length === 0) return;
  const origin = walk.start_lat !== null && walk.start_lng !== null ? `${walk.start_lat},${walk.start_lng}` : points[0];
  const destination = points[points.length - 1];
  const waypoints = (walk.start_lat !== null ? points.slice(0, -1) : points.slice(1, -1)).join("|");
  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=walking`;
  void Linking.openURL(url);
}

/** Native share sheet; on desktop browsers without Web Share, copies the link. Returns "copied" when it did. */
export async function shareWalk(walk: Walk): Promise<"shared" | "copied"> {
  const url = walkUrl(walk);
  const message = `${walk.title} — a Toronto walk by Geesling the goose 🪿 ${url}`;
  if (Platform.OS === "web") {
    const nav = globalThis.navigator as Navigator | undefined;
    if (nav?.share) {
      await nav.share({ title: walk.title, text: message, url });
      return "shared";
    }
    await nav?.clipboard?.writeText(url);
    return "copied";
  }
  await Share.share({ message, url, title: walk.title });
  return "shared";
}
