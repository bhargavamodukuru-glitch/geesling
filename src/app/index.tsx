import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DockTutorial, TUTORIAL_STEPS } from "@/components/DockTutorial";
import { Goose } from "@/components/Goose";
import { HatchIntro } from "@/components/HatchIntro";
import { ItemSheet } from "@/components/ItemSheet";
import { CityMap } from "@/components/map/CityMap";
import { ClockChip } from "@/components/map/ClockChip";
import { MapGreeting } from "@/components/map/MapGreeting";
import { RouteKey } from "@/components/map/RouteKey";
import { FeedbackPanel } from "@/components/panels/FeedbackPanel";
import { GeeslingPanel } from "@/components/panels/GeeslingPanel";
import { HappeningPanel } from "@/components/panels/HappeningPanel";
import { SavedPanel } from "@/components/panels/SavedPanel";
import { PixelButton } from "@/components/Pixel";
import { SetupNotice } from "@/components/SetupNotice";
import { useLocation } from "@/hooks/useLocation";
import { useSaved } from "@/hooks/useSaved";
import { fetchEventsInBounds, joinTeam } from "@/lib/api";
import { OUT_OF_AREA_MESSAGE, TORONTO_BOUNDS, isInToronto, isViewInToronto } from "@/lib/area";
import { isNight } from "@/lib/daylight";
import { isConfigured } from "@/lib/supabase";
import { colors, fonts, pixelShadow } from "@/lib/theme";
import type { Bounds, EventFilters, EventItem, MapItem, Walk } from "@/lib/types";

type Tab = "happening" | "saved" | "geesling" | "feedback";

// The menu along the bottom, like apps on an iPhone dock. Each opens its section as a sheet over the map.
const MENU: { key: Tab; label: string; title: string; icon: string | null; tile: string }[] = [
  { key: "happening", label: "Happening", title: "Happening now", icon: "📍", tile: colors.accent },
  { key: "saved", label: "Saved", title: "Saved", icon: "⭐", tile: colors.gold },
  { key: "geesling", label: "Ask", title: "Ask Geesling", icon: null, tile: colors.sky },
  { key: "feedback", label: "Feedback", title: "Beta feedback", icon: "💬", tile: colors.paid },
];
// Height of the menu, so sheets, cards and banners sit above it.
const DOCK_HEIGHT = 76;
const DOCK_MAX_WIDTH = 440;
// The grab bar above the menu (drag it to resize the menu).
const GRIP_HEIGHT = 16;
// Set once someone has finished or skipped the first-run tour of the menu.
const TUTORIAL_KEY = "geesling.tutorial.done";
// Remembered choices: light or dark mode (unset follows sunset), and how big the menu is.
const THEME_KEY = "geesling.theme";
const DOCK_SCALE_KEY = "geesling.dock.scale";
const DOCK_SCALES = { min: 0.75, max: 1.35 };
const clampScale = (n: number) => Math.min(DOCK_SCALES.max, Math.max(DOCK_SCALES.min, n));

export default function HomeScreen() {
  if (!isConfigured) return <SetupNotice />;
  return <Home />;
}

function Home() {
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const insets = useSafeAreaInsets();

  // Drag the handle on top of the menu to make it bigger or smaller; the size is remembered.
  const [dockScale, setDockScale] = useState(1);
  const dockScaleRef = useRef(1);
  const dragStart = useRef(1);
  const resizeDock = useCallback((next: number, save: boolean) => {
    dockScaleRef.current = clampScale(next);
    setDockScale(dockScaleRef.current);
    if (save) void AsyncStorage.setItem(DOCK_SCALE_KEY, String(dockScaleRef.current)).catch(() => {});
  }, []);
  // PanResponder keeps these callbacks and only calls them while dragging, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [dockHandle] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = dockScaleRef.current;
      },
      onPanResponderMove: (_event, gesture) => resizeDock(dragStart.current - gesture.dy / 160, false),
      onPanResponderRelease: () => resizeDock(dockScaleRef.current, true),
      onPanResponderTerminationRequest: () => false,
    }),
  );
  const dockSpace = DOCK_HEIGHT * dockScale + GRIP_HEIGHT + Math.max(insets.bottom, 8);

  // Light or dark mode. Until they pick one it follows the real sunset in Toronto.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    AsyncStorage.multiGet([THEME_KEY, DOCK_SCALE_KEY])
      .then(([[, savedTheme], [, savedScale]]) => {
        if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
        if (savedScale && Number.isFinite(Number(savedScale))) resizeDock(Number(savedScale), false);
      })
      .catch(() => {});
  }, [resizeDock]);
  const dark = theme ? theme === "dark" : isNight(now);
  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    setTheme(next);
    void AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
  };
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

  // The hatching intro plays over the map on every open; `entered` turns true once it has faded out.
  const [entered, setEntered] = useState(false);
  const [intro, setIntro] = useState(true);
  const [nudge, setNudge] = useState<string | null>(null);
  // Geesling's line over the map once the intro ends: busy (events are on) or quiet (nothing is).
  const [greeting, setGreeting] = useState<"busy" | "quiet" | null>(null);
  // First-run tour of the menu (step index), shown once after the intro, before Geesling's greeting.
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const firstVisit = useRef<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_KEY)
      .then((done) => (firstVisit.current = done !== "true"))
      .catch(() => (firstVisit.current = false));
  }, []);
  // On first view the event pins pop up one at a time; after that they just show.
  const [popping, setPopping] = useState(true);
  const [popped, setPopped] = useState(0);

  // The private ?team=<code> link marks this device as team, so its requests are highlighted in the usage sheet.
  const { team } = useLocalSearchParams<{ team?: string }>();
  const [teamNote, setTeamNote] = useState<string | null>(null);
  useEffect(() => {
    if (!team) return;
    joinTeam(team)
      .then((ok) => {
        // Take the code out of the address bar once the check is done, so a copied link doesn't carry it.
        if (Platform.OS === "web" && typeof window !== "undefined") window.history.replaceState(window.history.state, "", window.location.pathname);
        return ok;
      })
      .then((ok) => setTeamNote(ok ? "This device is marked as team. Its requests show in yellow in the usage sheet." : "That team link didn't work."))
      .catch(() => setTeamNote("Couldn't check the team link. Try again later."));
  }, [team]);
  useEffect(() => {
    if (!teamNote) return;
    const timer = setTimeout(() => setTeamNote(null), 6000);
    return () => clearTimeout(timer);
  }, [teamNote]);
  // The open section, or null for just the map.
  const [tab, setTab] = useState<Tab | null>(null);
  const [expanded, setExpanded] = useState(false);
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
    setWalk(next);
    setTab("geesling");
    setSelected(null);
    setFocusKey((k) => k + 1);
  }, []);

  // Once the map shows, Geesling flies over it and says what's on. With nothing on, the chat opens to plan a stroll.
  // Runs when both are known: the map is showing, and how many events are on anywhere in Toronto right now.
  const liveNow = useRef<number | null>(null);
  const shown = useRef(false);
  const greeted = useRef(false);
  const greet = useCallback(() => {
    if (greeted.current || !shown.current || liveNow.current === null) return;
    greeted.current = true;
    if (liveNow.current > 0) {
      setGreeting("busy");
      return;
    }
    setGreeting("quiet");
    setTab("geesling");
    setNudge("Looks like the city’s quiet tonight. Let’s go for a stroll! Tell me what you’re in the mood for.");
  }, []);
  // Counted while the egg hatches. If it fails, the map just shows with no greeting.
  useEffect(() => {
    const city = { minLat: TORONTO_BOUNDS.south, minLng: TORONTO_BOUNDS.west, maxLat: TORONTO_BOUNDS.north, maxLng: TORONTO_BOUNDS.east };
    fetchEventsInBounds(city, { window: "now", date: null, freeOnly: false, paidOnly: false, drinksOnly: false, rsvpOnly: false, categories: [] })
      .then((rows) => {
        liveNow.current = rows.length;
        greet();
      })
      .catch(() => {});
  }, [greet]);
  // The screen is black mid-fade: the map takes over underneath.
  const revealApp = useCallback(() => {
    shown.current = true;
    setEntered(true);
    if (firstVisit.current) setTutorialStep(0);
    else greet();
    // Location is asked for as the map appears, so the prompt doesn't cover the hatching.
    void locate();
  }, [greet, locate]);
  const finishIntro = useCallback(() => setIntro(false), []);
  const endTutorial = useCallback(() => {
    setTutorialStep(null);
    void AsyncStorage.setItem(TUTORIAL_KEY, "true").catch(() => {});
    greet();
  }, [greet]);
  // The busy line goes away on its own; the quiet one waits until they act on it.
  useEffect(() => {
    if (greeting !== "busy") return;
    const timer = setTimeout(() => setGreeting(null), 9000);
    return () => clearTimeout(timer);
  }, [greeting]);
  // Pins pop up one by one, taking about two and a half seconds however many there are.
  useEffect(() => {
    if (!entered || !popping || loadedKey === null) return;
    const done = popped >= events.length;
    const timer = setTimeout(() => (done ? setPopping(false) : setPopped((n) => n + 1)), done ? 0 : Math.min(180, Math.max(50, 2500 / events.length)));
    return () => clearTimeout(timer);
  }, [entered, popping, popped, events.length, loadedKey]);
  const clearWalk = useCallback(() => {
    setWalk(null);
    setTab(null);
  }, []);
  const noop = useCallback(() => {}, []);

  const selectItem = useCallback((item: MapItem | null, note: string | null = null) => {
    if (!item) return setSelected(null);
    const stopNote = note ?? walk?.stops.find((s) => s.item.id === item.id)?.why ?? null;
    setSelected({ item, note: stopNote });
  }, [walk]);

  const title = MENU.find((m) => m.key === tab)?.title ?? "";
  // Where menu tile i sits on screen (the dock is centred, with a 3 px border and 6 px inner padding), for the tour.
  const dockWidth = Math.min(width - 20, DOCK_MAX_WIDTH);
  const tileWidth = (dockWidth - 18) / MENU.length;
  const tileRect = (i: number) => ({
    x: (width - dockWidth) / 2 + 9 + i * tileWidth,
    y: height - Math.max(insets.bottom, 8) - (DOCK_HEIGHT - 8) * dockScale + 3,
    width: tileWidth,
    height: (DOCK_HEIGHT - 14) * dockScale,
  });
  // Tapping the open section's icon again closes it, like switching back to the map.
  const openTab = (key: Tab) => {
    setExpanded(false);
    setTab((current) => (current === key ? null : key));
  };

  const teamBanner = teamNote ? (
    <View style={[styles.teamNote, { top: insets.top + 12 }]} pointerEvents="none">
      <Text style={styles.noteText}>{teamNote}</Text>
    </View>
  ) : null;

  return (
    <View style={[styles.screen, dark && styles.screenDark]}>
      {/* Full screen. On the web the map stops at the menu, since Google's attribution must stay visible and can't move. */}
      <View style={[StyleSheet.absoluteFill, Platform.OS === "web" && { bottom: dockSpace - 4 }]}>
        <CityMap
          // While a walk is shown, only its stops are on the map. Pins appear once the intro is over.
          items={walk || !entered ? [] : popping ? events.slice(0, popped) : events}
          walk={walk}
          selectedId={selected?.item.id ?? null}
          userLocation={location}
          // The first time the person's location is known once the map is open, the camera moves to their area.
          focusKey={focusKey + (entered && location ? 1 : 0)}
          onSelect={(item) => selectItem(item)}
          onBoundsChange={onBoundsChange}
          bottomInset={dockSpace}
          dark={dark}
        />
      </View>

      {/* Banners and Geesling's greeting, clear of the status bar and the menu. */}
      <View style={[styles.overlay, { top: insets.top, bottom: dockSpace }]} pointerEvents="box-none">
        <ClockChip now={now} dark={dark} onToggle={toggleTheme} />
        {/* Below the clock. */}
        <View style={styles.banners} pointerEvents="box-none">
        {walk ? (
          <View style={styles.walkBanner}>
            <Text style={styles.walkBannerText} numberOfLines={1}>
              {walk.title}
            </Text>
            <PixelButton label="Clear route" small onPress={clearWalk} />
          </View>
        ) : null}
        {walk ? <RouteKey walk={walk} /> : null}
        {greeting && !walk ? (
          <MapGreeting
            message={greeting === "busy" ? "Toronto really is pretty from up here. Look at everything going on today!" : "Looks like the city’s quiet tonight. Let’s go for a stroll!"}
            actionLabel={greeting === "quiet" ? "Plan a stroll" : undefined}
            onAction={() => {
              setGreeting(null);
              setTab("geesling");
            }}
            onClose={() => setGreeting(null)}
          />
        ) : entered && !walk && bounds && !isViewInToronto(bounds) ? (
          <View style={styles.walkBanner} accessibilityLiveRegion="polite">
            <Text style={styles.noteText}>{OUT_OF_AREA_MESSAGE}</Text>
          </View>
        ) : !walk && entered && !locationNoteHidden && locationNote ? (
          <View style={styles.walkBanner}>
            <Text style={styles.noteText}>{locationNote.text}</Text>
            {locationNote.retry ? <PixelButton label="Try again" small onPress={() => void locate()} /> : null}
            <PixelButton label="✕" small onPress={() => setLocationNoteHidden(true)} accessibilityLabel="Dismiss location message" />
          </View>
        ) : null}
        </View>
      </View>

      {/* The open section, as a sheet over the map. Kept mounted so the chat survives switching sections. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
        style={[
          styles.sheetArea,
          wide ? { top: insets.top + 12, right: 12, width: 440, bottom: dockSpace } : { left: 0, right: 0, bottom: dockSpace, height: expanded ? "88%" : "56%" },
          !tab && styles.hidden,
        ]}
      >
        <View style={[styles.sheet, wide && styles.sheetWide]}>
          <View style={styles.sheetHeader}>
            {!wide ? (
              <Pressable
                onPress={() => setExpanded((e) => !e)}
                style={styles.grabberHit}
                accessibilityRole="button"
                accessibilityLabel={expanded ? "Make the panel smaller" : "Make the panel bigger"}
              >
                <View style={styles.grabber} />
              </Pressable>
            ) : null}
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>{title.toUpperCase()}</Text>
              <PixelButton label="✕" small onPress={() => setTab(null)} accessibilityLabel={`Close ${title}`} />
            </View>
          </View>
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
            {tab === "feedback" ? <FeedbackPanel /> : null}
            <View style={[{ flex: 1 }, tab !== "geesling" && styles.hidden]}>
              <GeeslingPanel
                origin={location}
                onLocate={locate}
                freeOnly={filters.freeOnly}
                initialRequest={null}
                onPromptConsumed={noop}
                onInitialPromptComplete={noop}
                onWalk={showWalk}
                onSelectStop={(item, why) => selectItem(item, why)}
                nudge={nudge}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {selected ? (
        <View style={[styles.cardWrap, { bottom: dockSpace + 8 }]} pointerEvents="box-none">
          <ItemSheet item={selected.item} note={selected.note} onClose={() => setSelected(null)} maxHeight={height - insets.top - dockSpace - 40} />
        </View>
      ) : null}

      <View style={[styles.dockWrap, { paddingBottom: Math.max(insets.bottom, 8) }]} pointerEvents="box-none">
        <View
          {...dockHandle.panHandlers}
          style={styles.dockHandle}
          accessibilityRole="adjustable"
          accessibilityLabel="Menu size"
          accessibilityHint="Drag up or down to make the menu bigger or smaller"
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => resizeDock(dockScaleRef.current + (event.nativeEvent.actionName === "increment" ? 0.15 : -0.15), true)}
        >
          <View style={[styles.dockGrip, dark && styles.dockGripDark]} />
        </View>
        <View style={[styles.dock, dark && styles.dockDark, { height: (DOCK_HEIGHT - 8) * dockScale, borderRadius: 24 * dockScale }, pixelShadow(3)]} accessibilityRole="tablist">
          {MENU.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => openTab(item.key)}
                accessibilityRole="tab"
                accessibilityLabel={item.key === "saved" ? `Saved, ${saved.length}` : item.title}
                accessibilityState={{ selected: active }}
                style={styles.dockItem}
              >
                <View style={[styles.tile, { width: 42 * dockScale, height: 42 * dockScale, borderRadius: 11 * dockScale, backgroundColor: item.tile }, active && styles.tileActive]}>
                  {item.icon ? <Text style={[styles.tileIcon, { fontSize: 22 * dockScale }]}>{item.icon}</Text> : <Goose size={2.2 * dockScale} walking={false} />}
                  {item.key === "saved" && saved.length > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{saved.length > 99 ? "99+" : saved.length}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.dockLabel, { fontSize: 11 * dockScale }, dark && styles.dockLabelDark, active && (dark ? styles.dockLabelActiveDark : styles.dockLabelActive)]} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {tutorialStep !== null ? (
        <DockTutorial
          step={tutorialStep}
          target={tileRect(tutorialStep)}
          screen={{ width, height }}
          cardBottom={dockSpace}
          onNext={() => (tutorialStep + 1 < TUTORIAL_STEPS.length ? setTutorialStep(tutorialStep + 1) : endTutorial())}
          onSkip={endTutorial}
        />
      ) : null}
      {intro ? <HatchIntro nightMode={dark} onReveal={revealApp} onDone={finishIntro} /> : null}
      {teamBanner}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment, overflow: "hidden" },
  screenDark: { backgroundColor: "#202B49" },
  teamNote: { position: "absolute", left: 12, right: 12, zIndex: 30, backgroundColor: colors.gold, borderWidth: 3, borderColor: colors.ink, padding: 8 },
  overlay: { position: "absolute", left: 0, right: 0, zIndex: 5 },
  banners: { position: "absolute", top: 40, left: 0, right: 0, bottom: 0 },
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
  sheetArea: { position: "absolute", zIndex: 8 },
  sheet: { flex: 1, backgroundColor: colors.parchment, borderTopWidth: 3, borderColor: colors.ink, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: "hidden" },
  sheetWide: { borderWidth: 3, borderRadius: 18 },
  sheetHeader: { backgroundColor: colors.paper, borderBottomWidth: 3, borderColor: colors.ink, paddingHorizontal: 12, paddingBottom: 8 },
  grabberHit: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 30 },
  grabber: { width: 44, height: 6, borderRadius: 3, backgroundColor: colors.inkSoft },
  sheetTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 15, color: colors.ink, letterSpacing: 1 },
  cardWrap: { position: "absolute", left: 10, right: 10, maxWidth: 520, alignSelf: "center", zIndex: 12 },
  dockWrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingHorizontal: 10, zIndex: 10 },
  dock: { flexDirection: "row", justifyContent: "space-around", width: "100%", maxWidth: DOCK_MAX_WIDTH, height: DOCK_HEIGHT - 8, paddingHorizontal: 6, backgroundColor: colors.paper, borderWidth: 3, borderColor: colors.ink, borderRadius: 24 },
  // A grab bar on top of the menu: drag it up or down to resize the menu.
  dockHandle: { alignSelf: "center", height: GRIP_HEIGHT, justifyContent: "center", paddingHorizontal: 28, cursor: "ns-resize" as never },
  dockGrip: { width: 46, height: 6, borderRadius: 3, backgroundColor: colors.ink, opacity: 0.55 },
  dockGripDark: { backgroundColor: "#D8C59A", opacity: 0.8 },
  dockDark: { backgroundColor: "#34435D", borderColor: "#D8C59A" },
  dockLabelDark: { color: "#D8C59A" },
  dockLabelActiveDark: { fontFamily: fonts.heading, color: "#FFF8E6" },
  dockItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  tile: { width: 42, height: 42, borderRadius: 11, borderWidth: 2, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  tileActive: { borderWidth: 3, borderColor: colors.ink, transform: [{ translateY: -3 }], ...Platform.select({ web: { boxShadow: `0px 3px 0px ${colors.shadow}` } as object, default: {} }) },
  tileIcon: { fontSize: 22 },
  badge: { position: "absolute", top: -7, right: -9, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: colors.live, borderWidth: 2, borderColor: colors.paper, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.heading, fontSize: 10, color: colors.white },
  dockLabel: { fontFamily: fonts.headingRegular, fontSize: 11, color: colors.inkSoft },
  dockLabelActive: { fontFamily: fonts.heading, color: colors.ink },
  hidden: { display: "none" },
});
