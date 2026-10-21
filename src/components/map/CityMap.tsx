// Native map: Apple Maps on iOS, Google Maps on Android (react-native-maps).
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import MapView, { Marker, Polygon, Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { MapPin } from "@/components/MapPin";
import { OUTSIDE_MASK_OUTER, PAN_BOUNDS, TORONTO_RING, clampToPanArea } from "@/lib/area";
import { decodePolyline } from "@/lib/polyline";
import { PHOTO_SPOTS } from "@/lib/photoSpots";
import { colors } from "@/lib/theme";
import type { MapItem } from "@/lib/types";
import { STARDEW_MAP_STYLE } from "./mapStyle";
import { DEFAULT_DELTA, TORONTO, walkFocusBounds, type CityMapProps } from "./types";

const PAN_SPAN = { lat: PAN_BOUNDS.north - PAN_BOUNDS.south, lng: PAN_BOUNDS.east - PAN_BOUNDS.west };
const OUTER = OUTSIDE_MASK_OUTER.map(([latitude, longitude]) => ({ latitude, longitude }));
const HOLE = TORONTO_RING.map(([latitude, longitude]) => ({ latitude, longitude }));

function regionToBounds(region: Region) {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLng: region.longitude - region.longitudeDelta / 2,
    maxLng: region.longitude + region.longitudeDelta / 2,
  };
}

export function CityMap({ items, walk, selectedId, userLocation, focusKey, onSelect, onBoundsChange }: CityMapProps) {
  const mapRef = useRef<MapView>(null);
  const initialRegion = useMemo<Region>(
    () => ({ latitude: userLocation?.lat ?? TORONTO.lat, longitude: userLocation?.lng ?? TORONTO.lng, ...DEFAULT_DELTA }),
    // Only the first render decides the initial camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    onBoundsChange(regionToBounds(initialRegion));
  }, [initialRegion, onBoundsChange]);

  // Recenter on the walk, or on the user, when asked.
  useEffect(() => {
    if (focusKey === 0 || !mapRef.current) return;
    const bounds = walk ? walkFocusBounds(walk, userLocation) : null;
    if (bounds) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: bounds.minLat, longitude: bounds.minLng },
          { latitude: bounds.maxLat, longitude: bounds.maxLng },
        ],
        { edgePadding: { top: 80, right: 60, bottom: 80, left: 60 }, animated: true },
      );
    } else if (userLocation) {
      mapRef.current.animateToRegion({ latitude: userLocation.lat, longitude: userLocation.lng, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 500);
    }
  }, [focusKey, walk, userLocation]);

  // Geesling covers Toronto only. Apple Maps can't be bounded natively, so after a gesture ends the camera is
  // pulled back inside Toronto (and kept from zooming out past the city) on both Apple and Google maps.
  const clampingRef = useRef(false);
  const handleRegionChange = (region: Region) => {
    // The region reported right after our own correction is accepted as is, so an unusual screen shape
    // (where the corrected region still looks "too wide") can never make the camera correct itself forever.
    if (clampingRef.current) {
      clampingRef.current = false;
      onBoundsChange(regionToBounds(region));
      return;
    }
    const center = clampToPanArea(region.latitude, region.longitude);
    const drifted = Math.abs(center.lat - region.latitude) > 1e-6 || Math.abs(center.lng - region.longitude) > 1e-6;
    const tooWide = region.latitudeDelta > PAN_SPAN.lat * 1.2 || region.longitudeDelta > PAN_SPAN.lng * 1.2;
    if (drifted || tooWide) {
      clampingRef.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: Math.min(region.latitudeDelta, PAN_SPAN.lat),
          longitudeDelta: Math.min(region.longitudeDelta, PAN_SPAN.lng),
        },
        300,
      );
      return;
    }
    onBoundsChange(regionToBounds(region));
  };

  const walkIds = useMemo(() => new Map(walk?.stops.map((s) => [s.item.id, s.order]) ?? []), [walk]);
  const pins: MapItem[] = useMemo(() => {
    const stopItems = walk?.stops.map((s) => s.item) ?? [];
    return [...stopItems, ...items.filter((i) => !walkIds.has(i.id)), ...(walk ? [] : PHOTO_SPOTS)];
  }, [items, walk, walkIds]);

  // Custom marker views must re-render briefly after data changes (fonts, labels), then freeze for performance.
  const [settledPins, setSettledPins] = useState<MapItem[] | null>(null);
  const tracking = settledPins !== pins;
  useEffect(() => {
    const timer = setTimeout(() => setSettledPins(pins), 800);
    return () => clearTimeout(timer);
  }, [pins]);

  const legs = useMemo(
    () =>
      (walk?.stops ?? [])
        .filter((s) => s.leg?.polyline)
        .map((s) => ({ key: `leg-${s.order}`, coords: decodePolyline(s.leg!.polyline!), transit: s.leg!.mode === "transit" })),
    [walk],
  );

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      customMapStyle={Platform.OS === "android" ? STARDEW_MAP_STYLE : undefined}
      mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
      showsUserLocation
      showsPointsOfInterests={false}
      showsCompass={false}
      toolbarEnabled={false}
      onRegionChangeComplete={handleRegionChange}
      onPress={(e) => {
        if (e.nativeEvent.action !== "marker-press") onSelect(null);
      }}
    >
      {legs.map((leg) => (
        <Polyline
          key={leg.key}
          coordinates={leg.coords}
          strokeColor={leg.transit ? colors.accent : colors.woodDark}
          strokeWidth={5}
          lineDashPattern={leg.transit ? undefined : [10, 8]}
        />
      ))}
      {pins.map((item) => (
        <Marker
          key={`${item.kind}-${item.id}`}
          coordinate={{ latitude: item.lat, longitude: item.lng }}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={tracking || selectedId === item.id}
          zIndex={walkIds.has(item.id) ? 1000 : selectedId === item.id ? 999 : 1}
          onPress={(e) => {
            e.stopPropagation();
            onSelect(item);
          }}
        >
          <MapPin item={item} order={walkIds.get(item.id)} selected={selectedId === item.id} />
        </Marker>
      ))}
      {/* Dim everything outside the city limit and outline the limit itself. */}
      <Polygon coordinates={OUTER} holes={[HOLE]} fillColor="rgba(32, 43, 73, 0.38)" strokeWidth={0} />
      <Polygon coordinates={HOLE} fillColor="transparent" strokeColor={colors.accent} strokeWidth={3} lineDashPattern={[10, 6]} />
    </MapView>
  );
}
