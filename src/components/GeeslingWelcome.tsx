import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Goose } from "@/components/Goose";
import { Panel, PixelButton } from "@/components/Pixel";
import { TorontoPixelBackdrop } from "@/components/TorontoPixelBackdrop";
import { isNight } from "@/lib/daylight";
import { HALLOWEEN } from "@/lib/season";
import { DEFAULT_PREFERENCES, buildPlanRequest, type LatLng, type PlanRequest } from "@/lib/planner";
import { colors, fonts, text } from "@/lib/theme";

interface Props {
  onAsk: (request: PlanRequest) => void;
  onSkip: () => void;
  userLocation: LatLng | null;
}

/** Example requests that fade in and out in the empty message box (spooky ones in Halloween week). */
const EVERYDAY_SAMPLES = [
  "im bored and want a sweet treat, then I just want to see whats happening",
  "i have a date soon and need some cute ideas, maybe a good dinner spot followed by ice cream",
  "free stuff to do with friends tonight, nothing too loud",
  "i want to run a 15k, suggest a route through the city",
  "rainy afternoon: a cozy café, a bookstore and maybe a gallery",
  "in town for the day, cheap eats and the best views",
];
const HALLOWEEN_SAMPLES = [
  "best halloween parties this weekend, nothing too pricey",
  "a haunted walk downtown, then a cozy spooky bar",
  "pumpkin patch and apple cider with friends",
  "costume shopping, then a halloween club night",
  "a scary movie screening and late-night tacos",
  "something halloween-y but chill for a date",
];
const SAMPLES = HALLOWEEN ? HALLOWEEN_SAMPLES : EVERYDAY_SAMPLES;
const SAMPLE_MS = 3800;
const FADE_MS = 450;

const NATIVE_DRIVER = Platform.OS !== "web";

/** Geesling's little dance on a fresh load: hop, wiggle, turn around, hop again. */
function useDance(onDone: () => void) {
  const [hop] = useState(() => new Animated.Value(0));
  const [tilt] = useState(() => new Animated.Value(0));
  const [flip, setFlip] = useState(false);
  const [dancing, setDancing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      setDancing(false);
      setFlip(false);
      onDone();
    };
    const step = (toHop: number, toTilt: number, ms: number) =>
      Animated.parallel([
        Animated.timing(hop, { toValue: toHop, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(tilt, { toValue: toTilt, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      ]);
    const bounce = (side: number) => Animated.sequence([step(-14, side, 160), step(0, 0, 160)]);
    const turn = Animated.timing(hop, { toValue: 0, duration: 1, useNativeDriver: NATIVE_DRIVER });

    // People who turn off motion get the bubbles straight away.
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) return finish();
      Animated.sequence([
        Animated.delay(250),
        bounce(-1),
        bounce(1),
        turn,
      ]).start(() => {
        if (cancelled) return;
        setFlip(true);
        Animated.sequence([bounce(1), bounce(-1), Animated.delay(120)]).start(() => {
          if (cancelled) return;
          setFlip(false);
          Animated.sequence([step(-22, 0, 200), step(0, 0, 220)]).start(finish);
        });
      });
    });
    return () => {
      cancelled = true;
    };
    // Runs once per fresh load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotate = tilt.interpolate({ inputRange: [-1, 1], outputRange: ["-10deg", "10deg"] });
  return { style: { transform: [{ translateY: hop }, { rotate }] }, flip, dancing };
}

/** Cycles through SAMPLES with a fade, while `active`. */
function useSample(active: boolean) {
  const [index, setIndex] = useState(0);
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: NATIVE_DRIVER }).start(() => {
        setIndex((i) => (i + 1) % SAMPLES.length);
        Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: NATIVE_DRIVER }).start();
      });
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [active, opacity]);
  return { sample: SAMPLES[index], opacity };
}

/** Bats in the sky and pumpkins on the grass, for Halloween week. Decoration only. */
function HalloweenDecor() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Text style={[styles.decor, { top: "9%", left: "12%", fontSize: 26 }]}>🦇</Text>
      <Text style={[styles.decor, { top: "17%", left: "34%", fontSize: 20, transform: [{ scaleX: -1 }] }]}>🦇</Text>
      <Text style={[styles.decor, { top: "5%", right: "38%", fontSize: 16 }]}>🦇</Text>
      <Text style={[styles.decor, { bottom: 18, left: "4%", fontSize: 30 }]}>🎃</Text>
      <Text style={[styles.decor, { bottom: 16, right: "5%", fontSize: 26 }]}>🎃</Text>
      <Text style={[styles.decor, { bottom: 20, left: "47%", fontSize: 20 }]}>👻</Text>
    </View>
  );
}

/** Fades and lifts children in once `show` turns true, after `delay` ms. */
function Reveal({ show, delay = 0, children }: { show: boolean; delay?: number; children: React.ReactNode }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!show) return;
    Animated.timing(progress, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
  }, [show, delay, progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return (
    <Animated.View style={{ opacity: progress, transform: [{ translateY }] }} pointerEvents={show ? "auto" : "none"}>
      {children}
    </Animated.View>
  );
}

export function GeeslingWelcome({ onAsk, onSkip, userLocation }: Props) {
  const [prompt, setPrompt] = useState("");
  // Follows the real sunrise and sunset in Toronto until the person taps the day/night toggle.
  const [nightOverride, setNightOverride] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const dance = useDance(() => setReady(true));
  const { sample, opacity: sampleOpacity } = useSample(ready && !prompt);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const nightMode = nightOverride ?? isNight(now);
  const torontoDate = new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  }).format(now);
  const torontoTime = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  }).format(now);
  const submit = () => {
    const value = prompt.trim();
    if (value) onAsk({ prompt: value });
  };
  // One tap: Geesling picks everything, starting near the person when their location is known.
  const surprise = () =>
    onAsk(buildPlanRequest({ ...DEFAULT_PREFERENCES, vibe: "surprise", area: userLocation ? "near" : "explore" }, userLocation));

  return (
    <SafeAreaView style={[styles.screen, nightMode && styles.nightScreen]} edges={["top", "left", "right", "bottom"]}>
      <TorontoPixelBackdrop nightMode={nightMode} />
      {HALLOWEEN ? <HalloweenDecor /> : null}
      <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.metaRow}>
            <Text style={[styles.clock, nightMode && styles.nightClock]}>
              TORONTO · {torontoDate} · {torontoTime}
            </Text>
            <Pressable
              onPress={() => setNightOverride(!nightMode)}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${nightMode ? "day" : "night"} scene`}
              style={[styles.sceneToggle, nightMode && styles.nightToggle]}
            >
              <Text style={[styles.sceneToggleText, nightMode && styles.nightToggleText]}>
                {nightMode ? "☀ DAY" : "☾ NIGHT"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.brand}>
            <Animated.View style={dance.style}>
              <Goose size={5} walking={false} flapping={dance.dancing} flip={dance.flip} />
            </Animated.View>
            <View style={{ gap: 0 }}>
              <Text style={[styles.wordmark, nightMode && styles.nightWordmark]}>GEESLING</Text>
              <Text style={[styles.submark, nightMode && styles.nightSubmark]}>{HALLOWEEN ? "TRICK, TREAT & WANDER" : "WANDER, WITH GOOSEY GANDER"}</Text>
            </View>
          </View>

          <View style={styles.conversation} accessibilityLabel="Chat with Geesling">
            <Reveal show={ready}>
              <Panel style={styles.greeting} shadow={3}>
                <Text style={styles.honk}>{HALLOWEEN ? "HONK-O-WEEN!" : "HONK!"}</Text>
                <Text style={[text.body, styles.centered]}>
                  {HALLOWEEN ? "Spooky season’s here. Let me waddle you to the city’s best Halloween haunts." : "Unsure what to do? Let me waddle you around the city."}
                </Text>
              </Panel>
            </Reveal>

            <Reveal show={ready} delay={350}>
              <View style={styles.composerBubble}>
                  {!prompt ? (
                    // Sample requests fade in and out like a placeholder; screen readers get them as the hint.
                    <Animated.Text style={[styles.input, styles.sample, { opacity: sampleOpacity }]} pointerEvents="none" numberOfLines={3}>
                      {sample}
                    </Animated.Text>
                  ) : null}
                  <TextInput
                    value={prompt}
                    onChangeText={setPrompt}
                    style={styles.input}
                    multiline
                    maxLength={1200}
                    accessibilityLabel="Tell Geesling what you're in the mood for"
                    accessibilityHint={`For example: ${SAMPLES[0]}`}
                    onSubmitEditing={submit}
                    onKeyPress={(event) => {
                      const native = event.nativeEvent as { key: string; shiftKey?: boolean };
                      if (Platform.OS === "web" && native.key === "Enter" && !native.shiftKey) {
                        event.preventDefault();
                        submit();
                      }
                    }}
                    submitBehavior="submit"
                    returnKeyType="send"
                  />
              </View>
            </Reveal>

            <Reveal show={ready} delay={650}>
              <View style={styles.sendRow}>
                <PixelButton label={HALLOWEEN ? "Trick or treat me" : "Surprise me"} icon={HALLOWEEN ? "🎃" : "🎲"} onPress={surprise} />
                <PixelButton label="Find my route" tone="red" disabled={!prompt.trim()} onPress={submit} />
              </View>
            </Reveal>
          </View>

          <Reveal show={ready} delay={850}>
            <PixelButton
              label="Skip to live map →"
              accessibilityLabel="Skip to live map"
              tone="red"
              small
              onPress={onSkip}
              style={styles.skipButton}
            />
          </Reveal>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment, overflow: "hidden" },
  nightScreen: { backgroundColor: "#202B49" },
  center: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 22, paddingVertical: 28 },
  content: { width: "100%", maxWidth: 560, gap: 20 },
  metaRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  clock: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.wood, letterSpacing: 0.3 },
  nightClock: { color: "#E8D6A7" },
  sceneToggle: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.paper },
  nightToggle: { backgroundColor: "#34435D", borderColor: "#D8C59A" },
  sceneToggleText: { fontFamily: fonts.heading, fontSize: 12, color: colors.ink },
  nightToggleText: { color: "#FFF8E6" },
  brand: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 },
  wordmark: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 40, color: colors.accent, letterSpacing: 1 },
  nightWordmark: { color: "#F0785D" },
  submark: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft, letterSpacing: 1.3 },
  nightSubmark: { color: "#E8D6A7" },
  // Same gap as `content`, so every block on the screen is evenly spaced.
  conversation: { gap: 20 },
  greeting: { gap: 5, padding: 16, backgroundColor: colors.paper, alignItems: "center" },
  centered: { textAlign: "center" },
  // Smaller than "Surprise me" and "Find my route": the map is the secondary path here.
  skipButton: { alignSelf: "center" },
  composerBubble: { width: "100%", minHeight: 96, backgroundColor: colors.gold, borderWidth: 3, borderColor: colors.ink, borderRadius: 16, borderBottomRightRadius: 3, paddingHorizontal: 10, paddingVertical: 8 },
  honk: { fontFamily: fonts.heading, fontSize: 19, color: colors.accent },
  input: {
    minHeight: 76,
    maxHeight: 180,
    backgroundColor: "transparent",
    paddingHorizontal: 6,
    paddingVertical: 8,
    fontFamily: fonts.body,
    fontSize: 22,
    color: colors.ink,
    textAlign: "center",
    textAlignVertical: "top",
  },
  // Sits over the empty input in the same spot as typed text would.
  // Exactly three lines tall, so a long sample is cut off with "…" instead of peeking out a fourth line.
  sample: { position: "absolute", top: 16, left: 16, right: 16, minHeight: 0, paddingVertical: 0, lineHeight: 24, maxHeight: 24 * 3, overflow: "hidden", color: colors.inkSoft },
  decor: { position: "absolute" },
  sendRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
});
