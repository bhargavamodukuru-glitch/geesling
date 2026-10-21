/// <reference types="google.maps" />
// Web map: Google Maps JavaScript API via @vis.gl/react-google-maps.
import { AdvancedMarker, APIProvider, Map, Polyline, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "@/components/Pixel";
import { Goose } from "@/components/Goose";
import { MapPin } from "@/components/MapPin";
import { decodePolyline } from "@/lib/polyline";
import { PHOTO_SPOTS } from "@/lib/photoSpots";
import { colors, text } from "@/lib/theme";
import type { MapItem } from "@/lib/types";
import { OUTSIDE_MASK_OUTER, PAN_BOUNDS, TORONTO_RING } from "@/lib/area";
import { TORONTO, walkFocusBounds, type CityMapProps } from "./types";

// Geesling covers Toronto only. People can pan a little past the city limit to see the border,
// but the camera stops at this box.
const PAN_RESTRICTION = { latLngBounds: { ...PAN_BOUNDS }, strictBounds: true };
const toPath = (ring: readonly (readonly [number, number])[]) => ring.map(([lat, lng]) => ({ lat, lng }));
// Google draws a hole where the inner ring winds the opposite way to the outer one.
function signedArea(ring: readonly (readonly [number, number])[]) {
  return ring.reduce((sum, [lat, lng], i) => {
    const [nLat, nLng] = ring[(i + 1) % ring.length];
    return sum + (lng * nLat - nLng * lat);
  }, 0);
}
const HOLE_RING = signedArea(OUTSIDE_MASK_OUTER) * signedArea(TORONTO_RING) > 0 ? [...TORONTO_RING].reverse() : TORONTO_RING;

/** Dims the map outside the city limit and draws the limit as a dashed line. */
function CityLimit() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const mask = new google.maps.Polygon({
      paths: [toPath(OUTSIDE_MASK_OUTER), toPath(HOLE_RING)],
      fillColor: "#202B49",
      fillOpacity: 0.38,
      strokeWeight: 0,
      clickable: false,
      map,
    });
    const line = new google.maps.Polyline({
      path: [...toPath(TORONTO_RING), toPath(TORONTO_RING)[0]],
      strokeOpacity: 0,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: colors.accent, scale: 3 }, offset: "0", repeat: "14px" }],
      clickable: false,
      map,
    });
    return () => {
      mask.setMap(null);
      line.setMap(null);
    };
  }, [map]);
  return null;
}

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
// Advanced markers need a Map ID. Create one with the Stardew style from mapStyle.ts in Google Cloud.
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

function CameraController({ walk, userLocation, focusKey }: Pick<CityMapProps, "walk" | "userLocation" | "focusKey">) {
  const map = useMap();
  useEffect(() => {
    if (!map || focusKey === 0) return;
    const bounds = walk ? walkFocusBounds(walk, userLocation) : null;
    if (bounds) {
      map.fitBounds({ north: bounds.maxLat, south: bounds.minLat, east: bounds.maxLng, west: bounds.minLng }, 80);
    } else if (userLocation) {
      map.panTo(userLocation);
      map.setZoom(15);
    }
  }, [map, walk, userLocation, focusKey]);
  return null;
}

export function CityMap({ items, walk, selectedId, userLocation, focusKey, onSelect, onBoundsChange }: CityMapProps) {
  const walkIds = useMemo(() => new globalThis.Map(walk?.stops.map((s) => [s.item.id, s.order]) ?? []), [walk]);
  const pins: MapItem[] = useMemo(() => {
    const stopItems = walk?.stops.map((s) => s.item) ?? [];
    return [...stopItems, ...items.filter((i) => !walkIds.has(i.id)), ...(walk ? [] : PHOTO_SPOTS)];
  }, [items, walk, walkIds]);
  const legs = useMemo(
    () =>
      (walk?.stops ?? [])
        .filter((s) => s.leg?.polyline)
        .map((s) => ({
          key: `leg-${s.order}`,
          path: decodePolyline(s.leg!.polyline!).map((p) => ({ lat: p.latitude, lng: p.longitude })),
          transit: s.leg!.mode === "transit",
        })),
    [walk],
  );

  if (!API_KEY) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.missing]}>
        <Panel style={styles.missingPanel}>
          <Goose size={4} walking={false} />
          <Text style={text.h2}>Map key missing</Text>
          <Text style={text.body}>Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in .env to show the Toronto map on the web.</Text>
        </Panel>
      </View>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} libraries={["marker"]}>
      <Map
        style={{ position: "absolute", inset: 0 }}
        mapId={MAP_ID}
        defaultCenter={userLocation ?? TORONTO}
        defaultZoom={13}
        gestureHandling="greedy"
        restriction={PAN_RESTRICTION}
        minZoom={9}
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        onClick={() => onSelect(null)}
        // onCameraChanged only fires on movement; idle also fires once the map first renders.
        onIdle={(event) => {
          const b = event.map.getBounds()?.toJSON();
          if (b) onBoundsChange({ minLat: b.south, maxLat: b.north, minLng: b.west, maxLng: b.east });
        }}
        onCameraChanged={(event) => {
          const b = event.detail.bounds;
          onBoundsChange({ minLat: b.south, maxLat: b.north, minLng: b.west, maxLng: b.east });
        }}
      >
        <CityLimit />
        <CameraController walk={walk} userLocation={userLocation} focusKey={focusKey} />
        {legs.map((leg) => (
          <Polyline
            key={leg.key}
            path={leg.path}
            strokeColor={leg.transit ? colors.accent : colors.woodDark}
            strokeWeight={5}
            strokeOpacity={leg.transit ? 0.95 : 0}
            icons={
              leg.transit
                ? []
                : [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: colors.woodDark, scale: 4 }, offset: "0", repeat: "16px" }]
            }
          />
        ))}
        {userLocation ? (
          <AdvancedMarker position={userLocation} zIndex={2000}>
            <View style={styles.me} />
          </AdvancedMarker>
        ) : null}
        {pins.map((item) => (
          <AdvancedMarker
            key={`${item.kind}-${item.id}`}
            position={{ lat: item.lat, lng: item.lng }}
            zIndex={walkIds.has(item.id) ? 1000 : selectedId === item.id ? 999 : 1}
            onClick={() => onSelect(item)}
            title={item.kind === "event" ? item.title : item.name}
          >
            <MapPin item={item} order={walkIds.get(item.id)} selected={selectedId === item.id} />
          </AdvancedMarker>
        ))}
      </Map>
    </APIProvider>
  );
}

const styles = StyleSheet.create({
  missing: { backgroundColor: colors.grass, alignItems: "center", justifyContent: "center", padding: 16 },
  missingPanel: { maxWidth: 360, alignItems: "center", gap: 8 },
  me: { width: 16, height: 16, backgroundColor: "#2F80ED", borderWidth: 3, borderColor: colors.white },
});
