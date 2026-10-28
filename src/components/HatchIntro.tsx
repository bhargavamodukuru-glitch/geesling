import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EGG, EGG_CRACKED, EGG_SPLIT, Pixels, SHELL_BOTTOM, SHELL_CAP } from "@/components/EggSprites";
import { Goose } from "@/components/Goose";
import { Panel, PixelButton } from "@/components/Pixel";
import { TorontoPixelBackdrop } from "@/components/TorontoPixelBackdrop";
import { HALLOWEEN } from "@/lib/season";
import { colors, fonts, text } from "@/lib/theme";

// Opening scene: an egg rolls in over the skyline and wiggles until it's tapped. Each tap cracks it more, and the
// third hatches Geesling (the same Geesling as everywhere else in the app), who steps out, flies up above its egg
// and says hello; then the screen fades to black and back, video-game style, onto the map.
// Skip goes straight to the fade. With Reduce Motion on, Geesling is already hatched and hovering.

type Stage = "egg" | "cracked" | "split" | "hatched";

const HELLO = "Hi, I’m Geesling! Your goose friend who knows all of Toronto’s hot goss.";

const NATIVE_DRIVER = Platform.OS !== "web";
// The egg sits on the grass, this far up from the bottom of the screen.
const STAGE_BOTTOM = 44;
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
  /** The screen is fully black: show the app underneath now. */
  onReveal: () => void;
  /** The fade back from black has finished. */
  onDone: () => void;
}

export function HatchIntro({ nightMode, onReveal, onDone }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const px = width < 420 ? 7 : 9;
  const play = useSounds();

  const [stage, setStage] = useState<Stage>("egg");
  // The egg can be tapped once it has rolled in.
  const [ready, setReady] = useState(false);
  const [pose, setPose] = useState<"sit" | "walk" | "fly">("sit");
  const [capOff, setCapOff] = useState(false);
  // 0 = clear, FADE_STEPS = black. `revealed` once the app is showing behind the curtain.
  const [curtain, setCurtain] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // Geesling's hello, typed out a letter at a time once it's flying.
  const [talking, setTalking] = useState(false);
  const [typed, setTyped] = useState(0);

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
      Animated.timing(gooseY, { toValue: -12 * px, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER }),
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

  // Each tap cracks the egg a little more; the third hatches Geesling, and the rest of the scene plays on its own.
  const tapEgg = () => {
    if (!ready || fading.current) return;
    if (stage === "egg" || stage === "cracked") {
      wiggleOnce(stage === "egg" ? 12 : 16, stage === "egg" ? 60 : 45);
      setStage(stage === "egg" ? "cracked" : "split");
      play("crack");
      buzz("crack");
    } else if (stage === "split") {
      hatch();
      later(800, stepOut);
      later(1700, flyUp);
      later(2700, () => setTalking(true));
    }
  };

  // Once the hello has typed out, give it a moment to be read, then fade to the map.
  useEffect(() => {
    if (!talking) return;
    const timer = typed < HELLO.length ? setTimeout(() => setTyped((n) => n + 1), 30) : setTimeout(fadeOut, 2000);
    return () => clearTimeout(timer);
  }, [talking, typed, fadeOut]);

  // While it waits to be tapped, the egg gives a little wiggle now and then.
  useEffect(() => {
    if (!ready || stage === "hatched") return;
    const timer = setInterval(() => wiggleOnce(6, 80), 2200);
    return () => clearInterval(timer);
  }, [ready, stage, wiggleOnce]);

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
        gooseY.setValue(-12 * px);
        setTyped(HELLO.length);
        setTalking(true);
        return;
      }
      Animated.timing(roll, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER }).start();
      later(1300, () => {
        buzz("tap");
        setReady(true);
        wiggleOnce(8, 70);
      });
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

          {talking ? (
            // Just above Geesling hovering over its egg (8 shell rows, 12 up, 16 tall, plus a gap).
            <View style={[styles.helloArea, { bottom: STAGE_BOTTOM + 38 * px }]} pointerEvents="none">
              <Panel style={styles.hello} shadow={4}>
                <Text style={styles.speaker} selectable={false}>GEESLING</Text>
                <Text style={[text.body, styles.helloLine]} selectable={false} accessibilityLiveRegion="polite">
                  {HELLO.slice(0, typed)}
                  {/* Keeps the box its full size while the line types out. */}
                  <Text style={styles.unseen}>{HELLO.slice(typed)}</Text>
                </Text>
              </Panel>
            </View>
          ) : null}

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
              <Pressable
                onPress={tapEgg}
                disabled={!ready}
                hitSlop={30}
                accessibilityRole="button"
                accessibilityLabel={stage === "split" ? "Geesling's egg is about to hatch. Tap it." : "Geesling's egg. Tap it to help it hatch."}
              >
                <Animated.View style={{ transform: [{ translateX }, { rotate: spin }, { rotate: tilt }] }}>
                  <Pixels grid={egg} size={px} />
                </Animated.View>
              </Pressable>
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

          {ready && stage !== "hatched" ? (
            <Text style={[styles.tapHint, nightMode && styles.tapHintNight]} pointerEvents="none">
              {stage === "split" ? "One more tap!" : "Tap the egg!"}
            </Text>
          ) : null}
          <PixelButton label="Skip" small onPress={fadeOut} style={[styles.skip, { top: insets.top + 12 }]} accessibilityLabel="Skip the intro" />
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
  skip: { position: "absolute", right: 16 },
  helloArea: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  hello: { width: "100%", maxWidth: 440, gap: 4, backgroundColor: colors.paper },
  speaker: { fontFamily: fonts.heading, fontSize: 13, color: colors.accent, letterSpacing: 1 },
  helloLine: { fontSize: 23, lineHeight: 25 },
  unseen: { opacity: 0 },
  tapHint: { position: "absolute", bottom: 6, alignSelf: "center", fontFamily: fonts.heading, fontSize: 17, color: colors.paper, textShadowColor: colors.shadow, textShadowRadius: 0, textShadowOffset: { width: 1, height: 1 } },
  tapHintNight: { color: "#E8D6A7" },
  decor: { position: "absolute" },
});
