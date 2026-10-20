import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Goose } from "@/components/Goose";
import { GeeslingWelcome } from "@/components/GeeslingWelcome";
import { GeeslingLoader } from "@/components/GeeslingLoader";
import { ItemSheet } from "@/components/ItemSheet";
import { CityMap } from "@/components/map/CityMap";
import { GeeslingPanel } from "@/components/panels/GeeslingPanel";
import { HappeningPanel } from "@/components/panels/HappeningPanel";
import { SavedPanel } from "@/components/panels/SavedPanel";
import { PixelButton } from "@/components/Pixel";
import { SetupNotice } from "@/components/SetupNotice";
import { useLocation } from "@/hooks/useLocation";
import { useSaved } from "@/hooks/useSaved";
import { fetchEventsInBounds } from "@/lib/api";
import { isInToronto } from "@/lib/area";
import type { PlanRequest } from "@/lib/planner";
import { isConfigured } from "@/lib/supabase";
import { colors, fonts } from "@/lib/theme";
import type { Bounds, EventFilters, EventItem, MapItem, Walk } from "@/lib/types";

type Tab = "happening" | "saved" | "geesling";

export default function HomeScreen() {
  if (!isConfigured) return <SetupNotice />;
  return <Home />;
}

function Home() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { location: deviceLocation, status: locationStatus, locate: locateDevice } = useLocation();
  // Geesling covers Toronto only: a location elsewhere is not used to center the map or to start walks.
  const location = useMemo(() => (deviceLocation && isInToronto(deviceLocation.lat, deviceLocation.lng) ? deviceLocation : null), [deviceLocation]);
  const outsideToronto = deviceLocation !== null && location === null;
  const locate = useCallback(async () => {
    const found = await locateDevice();
    return found && isInToronto(found.lat, found.lng) ? found : null;
  }, [locateDevice]);
  const locationNote = outsideToronto
    ? { text: "You’re outside Toronto, so this map shows downtown Toronto.", retry: false }
    : locationStatus === "denied"
      ? { text: "Location is off, so this is downtown Toronto. Allow location to start from your own spot.", retry: true }
      : locationStatus === "error"
        ? { text: "Couldn’t find your location, so this is downtown Toronto.", retry: true }
        : null;
  const { saved } = useSaved();

  const [entered, setEntered] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<PlanRequest | null>(null);
  const [transition, setTransition] = useState<"walk" | "map" | null>(null);
  const [tab, setTab] = useState<Tab>("happening");
  const [filters, setFilters] = useState<EventFilters>({ window: "now", date: null, freeOnly: false, paidOnly: false, drinksOnly: false, rsvpOnly: false, categories: [] });
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ item: MapItem; note: string | null } | null>(null);
  const [walk, setWalk] = useState<Walk | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [locationNoteHidden, setLocationNoteHidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [mapHeight, setMapHeight] = useState<number | undefined>(undefined);
  const [mapShare, setMapShare] = useState(() =>
    wide ? Math.max(0.25, Math.min(0.75, (width - 460) / width)) : 0.45,
  );
  const [splitLength, setSplitLength] = useState(0);
  const mapShareRef = useRef(mapShare);
  const splitLengthRef = useRef(splitLength);
  const dragStartShare = useRef(mapShare);

  useEffect(() => {
    mapShareRef.current = mapShare;
    splitLengthRef.current = splitLength;
  }, [mapShare, splitLength]);

  const resizeHandle = useMemo(
    // PanResponder retains these callbacks and invokes them only for drag
    // events; the referenced values are synchronized in the effect above.
    // eslint-disable-next-line react-hooks/refs
    () => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartShare.current = mapShareRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const length = splitLengthRef.current;
          if (length <= 0) return;
          const delta = wide ? gesture.dx : gesture.dy;
          const next = Math.max(0.25, Math.min(0.75, dragStartShare.current + delta / length));
          mapShareRef.current = next;
          setMapShare(next);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [wide],
  );

  // Debounce map movement so panning doesn't spam the database.
  const boundsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBoundsChange = useCallback((next: Bounds) => {
    if (boundsTimer.current) clearTimeout(boundsTimer.current);
    boundsTimer.current = setTimeout(() => setBounds(next), 450);
  }, []);

  const requestKey = bounds ? JSON.stringify([bounds, filters, reloadKey]) : null;
  const loading = requestKey !== null && requestKey !== loadedKey;

  useEffect(() => {
    if (!bounds || !requestKey) return;
    let cancelled = false;
    fetchEventsInBounds(bounds, filters)
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [bounds, filters, requestKey]);

  const showWalk = useCallback((next: Walk) => {
    setTransition(null);
    setWalk(next);
    setTab("geesling");
    setSelected(null);
    setFocusKey((k) => k + 1);
  }, []);

  const startPrompt = useCallback((request: PlanRequest) => {
    setPendingRequest(request);
    setTransition("walk");
    setEntered(true);
    setTab("geesling");
  }, []);
  const skipToMap = useCallback(() => {
    setTransition("map");
    // Ask for location while the loader shows so the map opens on the person's own area. Don't hold them up
    // for long: if the prompt is ignored the map opens on Toronto and recenters when they allow it.
    const located = locate();
    const minimum = new Promise<void>((resolve) => setTimeout(resolve, 800));
    const patience = new Promise<void>((resolve) => setTimeout(resolve, 6000));
    void Promise.race([Promise.all([located, minimum]), patience]).then(() => {
      setEntered(true);
      setTab("happening");
      setTransition(null);
    });
  }, [locate]);
  const clearWalk = useCallback(() => {
    setWalk(null);
    setTab("happening");
  }, []);
  const consumePrompt = useCallback(() => setPendingRequest(null), []);
  const completePrompt = useCallback(() => setTransition(null), []);

  const selectItem = useCallback((item: MapItem | null, note: string | null = null) => {
    if (!item) return setSelected(null);
    const stopNote = note ?? walk?.stops.find((s) => s.item.id === item.id)?.why ?? null;
    setSelected({ item, note: stopNote });
  }, [walk]);

  const map = (
    <View style={styles.mapWrap} onLayout={(e) => setMapHeight(e.nativeEvent.layout.height - 20)}>
      <CityMap
        items={walk ? [] : events} // while a walk is shown, only its stops are on the map
        walk={walk}
        selectedId={selected?.item.id ?? null}
        userLocation={location}
        // The first time the person's location is known once the map is open, the camera moves to their area.
        focusKey={focusKey + (entered && location ? 1 : 0)}
        onSelect={(item) => selectItem(item)}
        onBoundsChange={onBoundsChange}
      />
      {walk ? (
        <View style={styles.walkBanner}>
          <Text style={styles.walkBannerText} numberOfLines={1}>
            {walk.title}
          </Text>
          <PixelButton label="Clear walk" small onPress={clearWalk} />
        </View>
      ) : null}
      {!walk && entered && !locationNoteHidden && locationNote ? (
        <View style={styles.walkBanner}>
          <Text style={styles.noteText}>{locationNote.text}</Text>
          {locationNote.retry ? <PixelButton label="Try again" small onPress={() => void locate()} /> : null}
          <PixelButton label="✕" small onPress={() => setLocationNoteHidden(true)} accessibilityLabel="Dismiss location message" />
        </View>
      ) : null}
      {selected ? (
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <ItemSheet item={selected.item} note={selected.note} onClose={() => setSelected(null)} maxHeight={mapHeight} />
        </View>
      ) : null}
    </View>
  );

  const panel = (
    <View style={[styles.panel, wide && styles.panelWide]}>
      {!walk ? <View style={styles.tabs}>
        {(
          [
            ["happening", "HAPPENING"],
            ["saved", `SAVED (${saved.length})`],
            ["geesling", "ASK GEESLING"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <View style={styles.tabLabel}>
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
              {key === "geesling" ? <Goose size={0.8} walking={false} /> : null}
            </View>
          </Pressable>
        ))}
      </View> : null}
      <View style={{ flex: 1 }}>
        {tab === "happening" ? (
          <HappeningPanel
            events={events}
            loading={loading}
            error={error}
            filters={filters}
            onFilters={setFilters}
            onSelect={(e) => selectItem(e)}
            onRefresh={() => setReloadKey((k) => k + 1)}
          />
        ) : null}
        {tab === "saved" ? <SavedPanel onSelect={(i) => selectItem(i)} onShowWalk={showWalk} /> : null}
        {/* Kept mounted so the conversation survives tab switches. */}
        <View style={[{ flex: 1 }, tab !== "geesling" && styles.hidden]}>
          <GeeslingPanel
            origin={location}
            onLocate={locate}
            freeOnly={filters.freeOnly}
            initialRequest={pendingRequest}
            onPromptConsumed={consumePrompt}
            onInitialPromptComplete={completePrompt}
            onWalk={showWalk}
            onSelectStop={(item, why) => selectItem(item, why)}
          />
        </View>
      </View>
    </View>
  );

  if (!entered) return transition === "map"
    ? <GeeslingLoader label="Finding the live map…" />
    : <GeeslingWelcome onAsk={startPrompt} onSkip={skipToMap} userLocation={location} onLocate={locate} />;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
      <View
        style={[styles.layout, wide ? styles.row : styles.column]}
        onLayout={(event) => setSplitLength(wide ? event.nativeEvent.layout.width : event.nativeEvent.layout.height)}
      >
        <View style={[styles.mapArea, { flex: mapShare }]}>{map}</View>
        <View
          {...resizeHandle.panHandlers}
          style={[styles.resizeHandle, wide ? styles.resizeHandleVertical : styles.resizeHandleHorizontal]}
          accessibilityRole="adjustable"
          accessibilityLabel="Resize map and controls panel"
          accessibilityHint="Drag to give more space to the map or the controls panel"
        >
          <View style={[styles.resizeGrip, wide ? styles.resizeGripVertical : styles.resizeGripHorizontal]} />
        </View>
        <View style={[styles.panelArea, { flex: 1 - mapShare }]}>{panel}</View>
      </View>
      {transition === "walk" ? (
        <View style={styles.loadingCover}><GeeslingLoader label="Geesling is planning your walk…" /></View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment },
  loadingCover: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 },
  layout: { flex: 1 },
  row: { flexDirection: "row" },
  column: { flexDirection: "column" },
  mapArea: { minWidth: 0, minHeight: 0 },
  panelArea: { minWidth: 0, minHeight: 0 },
  mapWrap: { flex: 1, backgroundColor: colors.grass, overflow: "hidden" },
  resizeHandle: { backgroundColor: colors.wood, borderColor: colors.ink, alignItems: "center", justifyContent: "center", zIndex: 5 },
  resizeHandleHorizontal: { width: "100%", height: 24, borderTopWidth: 2, borderBottomWidth: 2, cursor: "row-resize" as never },
  resizeHandleVertical: { width: 24, height: "100%", borderLeftWidth: 2, borderRightWidth: 2, cursor: "col-resize" as never },
  resizeGrip: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink },
  resizeGripHorizontal: { width: 48, height: 6 },
  resizeGripVertical: { width: 6, height: 48 },
  walkBanner: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.paper,
    borderWidth: 3,
    borderColor: colors.ink,
    padding: 6,
  },
  walkBannerText: { flex: 1, fontFamily: fonts.heading, fontSize: 14, color: colors.ink },
  noteText: { flex: 1, fontFamily: fonts.body, fontSize: 17, lineHeight: 18, color: colors.ink },
  sheetWrap: { position: "absolute", left: 10, right: 10, bottom: 10, maxWidth: 520, alignSelf: "center" },
  panel: { flex: 1, borderTopWidth: 0, borderColor: colors.ink, backgroundColor: colors.parchment },
  panelWide: { borderLeftWidth: 0 },
  tabs: { flexDirection: "row", borderBottomWidth: 3, borderColor: colors.ink },
  tabLabel: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: colors.paper, borderRightWidth: 2, borderColor: colors.ink },
  tabActive: { backgroundColor: colors.accent },
  tabText: { fontFamily: fonts.heading, fontSize: 12, color: colors.ink },
  tabTextActive: { color: colors.white },
  hidden: { display: "none" },
});
