import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AboutYouForm } from "@/components/AboutYouForm";
import { EGG, EGG_CRACKED, EGG_SPLIT, Pixels, SHELL_BOTTOM, SHELL_CAP } from "@/components/EggSprites";
import { Goose } from "@/components/Goose";
import { useAccount } from "@/hooks/useAccount";
import { useMotion } from "@/hooks/useMotion";
import { Panel, PixelButton } from "@/components/Pixel";
import { ClockChip } from "@/components/map/ClockChip";
import { TorontoPixelBackdrop } from "@/components/TorontoPixelBackdrop";
import { HALLOWEEN } from "@/lib/season";
import { colors, fonts } from "@/lib/theme";

// Opening screen: an egg rolls in over the skyline, cracks and hatches on its own; Geesling (the same Geesling as
// everywhere else in the app) steps out, flies up over its egg and says hello. "Next" brings its second line with the
// text box (rotating examples) and "skip to the live map". Asking starts planning in the background and, for someone
// who hasn't shared their details yet, shows the "about you" form while Geesling works; skipping shows it too. Then
// the screen fades to black and back, video-game style, onto the map (and the answer). With Reduce Motion on,
// Geesling is already hatched and hovering.

type Stage = "egg" | "cracked" | "split" | "hatched";

// What Geesling says, in order. The text box comes with the second line.
const LINES = [
  "Hi, welcome to Geesling, your one-stop shop for everything Toronto!",
  "I help you see what’s going on in Toronto, whether you need help planning a date or have some time to kill. Simply tell me what you’re in the mood for and let me do the rest!",
];
const TYPE_MS = 28;

// Example requests that take turns in the empty text box.
const EXAMPLES = [
  "e.g. cheap eats, then a gallery this afternoon",
  "e.g. a date night under $60: dinner, then dessert",
  "e.g. run a 10k along the waterfront",
  "e.g. free things to do with friends tonight",
  "e.g. 3 hours in Kensington: thrift, tacos, live music",
  "e.g. rainy day: a cozy café, a bookstore and a museum",
];
const EXAMPLE_MS = 3000;

const NATIVE_DRIVER = Platform.OS !== "web";
// The egg sits on the grass, this far up from the bottom of the screen.
const STAGE_BOTTOM = 44;
// How many pixels Geesling hovers above its shell.
const HOVER = 10;
// The fade goes to black and back in hard steps, like an old console.
const FADE_STEPS = 6;

function buzz(kind: "tap" | "crack" | "hatch") {
  if (Platform.OS === "web") return;
  if (kind === "hatch") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else void Haptics.impactAsync(kind === "crack" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Crack and peep sounds. Browsers may block sound before the first tap, which is fine: the scene works silently. */
function useSounds() {
  const players = useRef<{ crack: AudioPlayer; peep: AudioPlayer } | null>(null);
  useEffect(() => {
    try {
      players.current = {
        crack: createAudioPlayer(require("../../assets/sounds/crack.wav")),
        peep: createAudioPlayer(require("../../assets/sounds/peep.wav")),
      };
    } catch {
      players.current = null;
    }
    return () => {
      players.current?.crack.remove();
      players.current?.peep.remove();
    };
  }, []);
  return useCallback((name: "crack" | "peep") => {
    const player = players.current?.[name];
    if (!player) return;
    try {
      void player.seekTo(0);
      player.play();
    } catch {
      // No sound is fine.
    }
  }, []);
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
    </View>
  );
}

const BURST = [[-1, -1], [0, -1.3], [1, -1], [-1.3, 0], [1.3, 0], [-0.8, 0.6], [0.8, 0.6]];

interface Props {
  /** Night scene (moon and stars) to match night mode. */
  nightMode: boolean;
  /** Toronto's time for the clock at the top, and the day/night switch beside it. */
  now: Date;
  onToggleTheme: () => void;
  /** The screen is fully black: show the app underneath now. */
  onReveal: () => void;
  /** The fade back from black has finished. */
  onDone: () => void;
  /** They typed a question: the app starts planning it now and opens the chat with it once the map shows. */
  onAsk: (prompt: string) => void;
  /** Geesling's planning progress (the current step, then "ready" or "done"), shown on the form while it waits. */
  planStatus: string | null;
}

export function HatchIntro({ nightMode, now, onToggleTheme, onReveal, onDone, onAsk, planStatus }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const px = width < 420 ? 7 : 9;
  const play = useSounds();

  const [stage, setStage] = useState<Stage>("egg");
  // Which of Geesling's lines is showing (-1 = not talking yet), how much of it has typed out, and whether the
  // "about you" form has taken over the card.
  const [line, setLine] = useState(-1);
  const [typed, setTyped] = useState(0);
  const [form, setForm] = useState<"asked" | "skipped" | null>(null);
  const { ready: accountReady, signedUp } = useAccount();
  const [pose, setPose] = useState<"sit" | "walk" | "fly">("sit");
  const [capOff, setCapOff] = useState(false);
  // 0 = clear, FADE_STEPS = black. `revealed` once the app is showing behind the curtain.
  const [curtain, setCurtain] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [prompt, setPrompt] = useState("");
  // The examples rotate while the box is empty, and hold still once it's focused or with animations off.
  const { motion } = useMotion();
  const [example, setExample] = useState(0);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (prompt || focused || !motion) return;
    const timer = setInterval(() => setExample((n) => (n + 1) % EXAMPLES.length), EXAMPLE_MS);
    return () => clearInterval(timer);
  }, [prompt, focused, motion]);

  const [roll] = useState(() => new Animated.Value(0));
  const [wiggle] = useState(() => new Animated.Value(0));
  const [gooseX] = useState(() => new Animated.Value(0));
  const [gooseY] = useState(() => new Animated.Value(0));
  const [capDrop] = useState(() => new Animated.Value(0));
  const [burst] = useState(() => new Animated.Value(0));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fading = useRef(false);
  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  const hatch = useCallback((quiet = false) => {
    setStage("hatched");
    if (quiet) return;
    play("peep");
    buzz("hatch");
    burst.setValue(0);
    Animated.timing(burst, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
    Animated.sequence([
      Animated.timing(gooseY, { toValue: -2 * px, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(gooseY, { toValue: 0, duration: 200, easing: Easing.bounce, useNativeDriver: NATIVE_DRIVER }),
    ]).start();
  }, [burst, gooseY, play, px]);

  // Out of the shell: a hop to the right that lands on the grass, shaking the shell cap off.
  const stepOut = useCallback(() => {
    setPose("walk");
    setCapOff(true);
    Animated.timing(capDrop, { toValue: 1, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
    Animated.parallel([
      Animated.timing(gooseX, { toValue: 11 * px, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      Animated.sequence([
        Animated.timing(gooseY, { toValue: -4 * px, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(gooseY, { toValue: 5 * px, duration: 390, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      ]),
    ]).start();
  }, [capDrop, gooseX, gooseY, px]);

  // Up and over the egg, then hovering there, wings flapping, in one spot.
  const flyUp = useCallback(() => {
    setPose("fly");
    buzz("tap");
    Animated.parallel([
      Animated.timing(gooseX, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(gooseY, { toValue: -HOVER * px, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER }),
    ]).start();
  }, [gooseX, gooseY, px]);

  // To black in steps, show the app, then back from black in steps.
  const fadeOut = useCallback(() => {
    if (fading.current) return;
    fading.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    for (let step = 1; step <= FADE_STEPS; step++) later(step * 70, () => setCurtain(step));
    later(FADE_STEPS * 70 + 60, () => {
      setRevealed(true);
      onReveal();
    });
    for (let step = 1; step <= FADE_STEPS; step++) later(FADE_STEPS * 70 + 300 + step * 80, () => setCurtain(FADE_STEPS - step));
    later(FADE_STEPS * 70 + 300 + FADE_STEPS * 80 + 40, onDone);
  }, [onDone, onReveal]);

  const wiggleOnce = useCallback((deg: number, ms: number) => {
    Animated.sequence([
      Animated.timing(wiggle, { toValue: -deg, duration: ms, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(wiggle, { toValue: deg, duration: ms * 2, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(wiggle, { toValue: -deg / 2, duration: ms, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(wiggle, { toValue: 0, duration: ms, useNativeDriver: NATIVE_DRIVER }),
    ]).start();
  }, [wiggle]);

  // The form only shows to someone who hasn't shared their details on this device.
  const needsForm = accountReady && !signedUp;
  const ask = () => {
    const value = prompt.trim();
    if (!value || fading.current) return;
    onAsk(value);
    if (needsForm) setForm("asked");
    else fadeOut();
  };
  const skip = () => {
    if (fading.current) return;
    if (needsForm) setForm("skipped");
    else fadeOut();
  };

  // Geesling's line types out a letter at a time (all at once with animations off).
  useEffect(() => {
    if (line < 0 || typed >= LINES[line].length) return;
    if (!motion) {
      const done = setTimeout(() => setTyped(LINES[line].length), 0);
      return () => clearTimeout(done);
    }
    const timer = setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => clearTimeout(timer);
  }, [line, typed, motion]);
  const nextLine = () => {
    setLine(1);
    setTyped(0);
  };

  // The egg rolls in (or, with Reduce Motion, Geesling is already up).
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        roll.setValue(1);
        hatch(true);
        setPose("fly");
        setCapOff(true);
        gooseY.setValue(-HOVER * px);
        setLine(0);
        setTyped(LINES[0].length);
        return;
      }
      // Rolls in, wiggles, cracks twice and hatches on its own; then Geesling steps out, flies up and talks.
      Animated.timing(roll, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER }).start();
      later(1300, () => buzz("tap"));
      later(1600, () => wiggleOnce(8, 70));
      later(2050, () => { setStage("cracked"); play("crack"); buzz("crack"); });
      later(2500, () => wiggleOnce(12, 60));
      later(2950, () => { setStage("split"); play("crack"); buzz("crack"); });
      later(3300, () => wiggleOnce(16, 45));
      later(3700, () => hatch());
      later(4500, stepOut);
      later(5400, flyUp);
      later(6300, () => setLine(0));
    });
    const pending = timers;
    return () => {
      cancelled = true;
      pending.current.forEach(clearTimeout);
    };
    // Runs once: the scene only plays on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eggWidth = 14 * px;
  const translateX = roll.interpolate({ inputRange: [0, 1], outputRange: [-(width / 2 + eggWidth), 0] });
  // Rolling right: the egg turns two full times on its way in.
  const spin = roll.interpolate({ inputRange: [0, 1], outputRange: ["-720deg", "0deg"] });
  const tilt = wiggle.interpolate({ inputRange: [-30, 30], outputRange: ["-30deg", "30deg"] });
  const egg = stage === "egg" ? EGG : stage === "cracked" ? EGG_CRACKED : EGG_SPLIT;

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents={revealed ? "none" : "auto"}>
      {!revealed ? (
        <View style={[StyleSheet.absoluteFill, styles.screen]}>
          <TorontoPixelBackdrop nightMode={nightMode} />
          {HALLOWEEN ? <HalloweenDecor /> : null}

          {/* Geesling's speech (and then the form), centred between the clock and Geesling hovering over its egg
              (shell 8 + hover + 16 tall, in pixels). The form is taller, so it gets the whole screen above the grass. */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[styles.askArea, { top: insets.top + 50, bottom: form ? STAGE_BOTTOM + 12 : STAGE_BOTTOM + (8 + HOVER + 16) * px + 12 }]}
            pointerEvents="box-none"
          >
            {form ? (
              <Panel style={[styles.askCard, styles.formCard]} shadow={4}>
                <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
                  <Text style={styles.speaker}>GEESLING</Text>
                  <Text style={styles.line} accessibilityRole="header">
                    {form === "asked" ? "On it! While I plan your route, tell me a little about you." : "Before you explore, tell me a little about you."}
                  </Text>
                  {/* While they fill this in, Geesling's planning carries on; its progress shows here. */}
                  {form === "asked" ? (
                    <View style={[styles.progress, planStatus === "ready" && styles.progressDone]} accessibilityLiveRegion="polite">
                      {planStatus === "ready" || planStatus === "done" ? (
                        <Text style={styles.progressText}>
                          {planStatus === "ready" ? "✓ Your route is ready! Save your details or skip to see it." : "✓ I have an answer for you. Save your details or skip to see it."}
                        </Text>
                      ) : (
                        <>
                          <Goose size={2} walking={false} flapping />
                          <Text style={styles.progressText}>{planStatus ?? "Reading your request"}…</Text>
                        </>
                      )}
                    </View>
                  ) : null}
                  <AboutYouForm onSaved={fadeOut} secondary={{ label: "Skip for now", onPress: fadeOut }} />
                </ScrollView>
              </Panel>
            ) : line >= 0 ? (
              <Panel style={styles.askCard} shadow={4}>
                <Text style={styles.speaker}>GEESLING</Text>
                <Text style={styles.line} accessibilityLiveRegion="polite">
                  {LINES[line].slice(0, typed)}
                  {/* Keeps the box its full size while the line types out. */}
                  <Text style={styles.unseen}>{LINES[line].slice(typed)}</Text>
                </Text>
                {line === 0 ? (
                  <View style={styles.askRow}>
                    <View />
                    <PixelButton label="Next" tone="red" onPress={nextLine} />
                  </View>
                ) : (
                  <>
                    <TextInput
                      value={prompt}
                      onChangeText={setPrompt}
                      placeholder={EXAMPLES[example]}
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                      placeholderTextColor={colors.inkSoft}
                      style={styles.input}
                      multiline
                      maxLength={1200}
                      accessibilityLabel="Tell Geesling what you're in the mood for"
                      submitBehavior="submit"
                      returnKeyType="send"
                      onSubmitEditing={ask}
                      onKeyPress={(event) => {
                        const native = event.nativeEvent as { key: string; shiftKey?: boolean };
                        if (Platform.OS === "web" && native.key === "Enter" && !native.shiftKey) {
                          event.preventDefault();
                          ask();
                        }
                      }}
                    />
                    <View style={styles.askRow}>
                      <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel="Skip to the live map" hitSlop={8}>
                        <Text style={styles.mapLink}>or skip to the live map →</Text>
                      </Pressable>
                      <PixelButton label="Ask" tone="red" disabled={!prompt.trim()} onPress={ask} />
                    </View>
                  </>
                )}
              </Panel>
            ) : null}
          </KeyboardAvoidingView>

          <View style={styles.stage} pointerEvents="box-none">
            {stage === "hatched" ? (
              <View style={{ width: eggWidth, height: 8 * px }}>
                {/* Geesling sits 3 pixels down inside the bottom shell until it steps out. */}
                <Animated.View style={[styles.goose, { bottom: 5 * px, zIndex: pose === "sit" ? 1 : 4, transform: [{ translateX: gooseX }, { translateY: gooseY }] }]}>
                  <Goose size={px} walking={pose === "walk"} flapping={pose === "fly"} />
                </Animated.View>
                <View style={{ position: "absolute", bottom: 0, zIndex: 2 }}>
                  <Pixels grid={SHELL_BOTTOM} size={px} />
                </View>
                <Animated.View
                  style={[
                    styles.cap,
                    {
                      left: 6 * px,
                      bottom: 19 * px,
                      transform: capOff
                        ? [
                            { translateX: capDrop.interpolate({ inputRange: [0, 1], outputRange: [0, -8 * px] }) },
                            { translateY: capDrop.interpolate({ inputRange: [0, 1], outputRange: [0, 13 * px] }) },
                            { rotate: capDrop.interpolate({ inputRange: [0, 1], outputRange: ["-14deg", "-160deg"] }) },
                          ]
                        : [{ translateY: gooseY }, { rotate: "-14deg" }],
                    },
                  ]}
                >
                  <Pixels grid={SHELL_CAP} size={px} />
                </Animated.View>
              </View>
            ) : (
              <Animated.View style={{ transform: [{ translateX }, { rotate: spin }, { rotate: tilt }] }} accessibilityRole="image" accessibilityLabel="Geesling's egg, hatching">
                <Pixels grid={egg} size={px} />
              </Animated.View>
            )}
            {stage === "hatched"
              ? BURST.map(([dx, dy], i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.spark,
                      {
                        width: px,
                        height: px,
                        opacity: burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1, 0] }),
                        transform: [
                          { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dx * px * 9] }) },
                          { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dy * px * 9] }) },
                        ],
                      },
                    ]}
                  />
                ))
              : null}
          </View>

          {/* Toronto's date and time on the left, the day/night switch on the right. */}
          <View style={[styles.clockRow, { top: insets.top }]} pointerEvents="box-none">
            <ClockChip now={now} dark={nightMode} onToggle={onToggleTheme} />
          </View>

        </View>
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.curtain, { opacity: curtain / FADE_STEPS }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Above everything on the main screen, menu included.
  root: { zIndex: 50 },
  screen: { backgroundColor: colors.parchment },
  stage: { position: "absolute", left: 0, right: 0, bottom: STAGE_BOTTOM, alignItems: "center", justifyContent: "flex-end" },
  goose: { position: "absolute", left: 0 },
  cap: { position: "absolute", zIndex: 3 },
  spark: { position: "absolute", bottom: 60, backgroundColor: colors.gold, borderWidth: 1, borderColor: colors.wood },
  curtain: { backgroundColor: "#000000" },
  askArea: { position: "absolute", left: 16, right: 16, alignItems: "center", justifyContent: "center", zIndex: 5 },
  clockRow: { position: "absolute", left: 0, right: 0, height: 44, zIndex: 6 },
  askCard: { width: "100%", maxWidth: 480, gap: 10, padding: 16, backgroundColor: colors.paper },
  speaker: { fontFamily: fonts.heading, fontSize: 13, color: colors.accent, letterSpacing: 1 },
  formCard: { maxHeight: "100%" },
  line: { fontFamily: fonts.body, fontSize: 23, lineHeight: 25, color: colors.ink },
  unseen: { opacity: 0 },
  progress: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.parchment, borderWidth: 2, borderColor: colors.ink, padding: 8 },
  progressDone: { backgroundColor: "#E2EFD0" },
  progressText: { flex: 1, fontFamily: fonts.body, fontSize: 19, lineHeight: 20, color: colors.ink },
  input: { minHeight: 64, maxHeight: 140, backgroundColor: colors.white, borderWidth: 3, borderColor: colors.ink, paddingHorizontal: 10, paddingVertical: 8, fontFamily: fonts.body, fontSize: 21, color: colors.ink, textAlignVertical: "top" },
  askRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  mapLink: { fontFamily: fonts.body, fontSize: 18, color: colors.inkSoft, textDecorationLine: "underline" },
  decor: { position: "absolute" },
});
