import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
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
import { DEFAULT_PREFERENCES, SHORTCUT_VIBES, VIBES, buildPlanRequest, type LatLng, type PlanRequest, type Vibe } from "@/lib/planner";
import { PlannerFlow } from "@/components/PlannerFlow";
import { HALLOWEEN } from "@/lib/season";
import { colors, fonts } from "@/lib/theme";

// Opening screen: on open, an egg rolls in over the skyline, cracks and hatches on its own; Geesling (the same
// Geesling as everywhere else in the app) steps out, then flies up into its place beside the chat, shrinking as it
// goes, and its message bubble pops open ("I help you discover more of Toronto…") with quick replies (Date, Friends,
// Solo, Try something new open the 3-step planner; Surprise me plans in one tap) and the person's own reply bubble to
// type into (rotating examples), or "skip to the live map". A small "Skip intro" link jumps straight to Geesling in
// its place with the chat open. Every way in (asking, a vibe, Surprise me, skipping to the map) shows the "about you" form
// first (filled in if this device shared details before); for a request it's the loading page while Geesling plans,
// and after Save or "Skip for now" it waits with "Finishing your route…" until the route is ready. Then the screen fades to black
// and back, video-game style, onto the map (and the answer). With Reduce Motion or the animations switch off, Geesling
// is already in its place.

type Stage = "egg" | "cracked" | "split" | "hatched";

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

const HELLO = "Hi, I’m Geesling! I help you discover more of Toronto. Tell me what you’re in the mood for or what your budget is.";
// Geesling takes off for its place beside the chat at FLY_AT; the hello pops in when it lands.
const FLY_AT = 5400;
const FLY_MS = 1000;
// Geesling's size in its place beside the chat (pixels per sprite pixel); the sprite is 14 × 16.
const PERCH_PX = 3;
const PERCH_W = 14 * PERCH_PX;
const PERCH_H = 16 * PERCH_PX;

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
  /** Toronto's time for the clock at the top, and the day/night switch beside it. */
  now: Date;
  onToggleTheme: () => void;
  /** The screen is fully black: show the app underneath now. */
  onReveal: () => void;
  /** The fade back from black has finished. */
  onDone: () => void;
  /** They asked (typed, or picked a vibe): the app starts planning it now and opens the chat with it once the map shows. */
  onAsk: (request: PlanRequest) => void;
  /** For the planner's "Near me" and for Surprise me. */
  userLocation: LatLng | null;
  onLocate: () => Promise<LatLng | null>;
  /** Geesling's planning progress (the current step, then "ready" or "done"), shown on the form while it waits. */
  planStatus: string | null;
  /** A request to start with in the reply box (from an email's "Plan my day" button). */
  initialPrompt?: string;
}

export function HatchIntro({ nightMode, now, onToggleTheme, onReveal, onDone, onAsk, userLocation, onLocate, planStatus, initialPrompt = "" }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const px = width < 420 ? 7 : 9;
  const play = useSounds();

  const [stage, setStage] = useState<Stage>("egg");
  // Whether Geesling has landed and its hello is up, whether a vibe's planner has taken the chat over, and whether
  // the "about you" form has.
  const [chat, setChat] = useState(false);
  // Geesling heading for (or sitting in) its place beside the chat: "fly" animates there, "now" jumps there.
  const [perch, setPerch] = useState<"none" | "fly" | "now">("none");
  const slotRef = useRef<ComponentRef<typeof View>>(null);
  const baseRef = useRef<ComponentRef<typeof View>>(null);
  const [pop] = useState(() => new Animated.Value(0));
  const [plannerVibe, setPlannerVibe] = useState<Vibe | null>(null);
  const [form, setForm] = useState<"asked" | "skipped" | null>(null);
  // Details this device shared before, if any: the form shows them filled in.
  const { profile } = useAccount();
  // After Save or "Skip for now" while the route is still being planned: the card stays up as the loading page.
  const [finishing, setFinishing] = useState(false);
  const [pose, setPose] = useState<"sit" | "walk" | "fly">("sit");
  const [capOff, setCapOff] = useState(false);
  // 0 = clear, FADE_STEPS = black. `revealed` once the app is showing behind the curtain.
  const [curtain, setCurtain] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt);
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
  const [gooseScale] = useState(() => new Animated.Value(1));
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

  // Up out of the shell and into its place beside the chat (see the perch effect below).
  const flyUp = useCallback(() => {
    setPose("fly");
    buzz("tap");
    setPerch("fly");
  }, []);

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

  // Every way in (typed request, a vibe's planner, Surprise me, skip to the live map) goes through the "about you"
  // form first; for a request it's also the loading page while Geesling plans.
  const send = (request: PlanRequest) => {
    if (fading.current) return;
    onAsk(request);
    setForm("asked");
  };
  const ask = () => {
    const value = prompt.trim();
    if (value) send({ prompt: value });
  };
  // One tap: Geesling picks everything, starting near the person when their location is known.
  const surprise = () => send(buildPlanRequest({ ...DEFAULT_PREFERENCES, vibe: "surprise", area: userLocation ? "near" : "explore" }, userLocation));
  const pickVibe = (vibe: Vibe) => (vibe === "surprise" ? surprise() : setPlannerVibe(vibe));
  const skip = () => {
    if (fading.current) return;
    setForm("skipped");
  };
  // Leaving the form: straight to the map, or (for a request still being planned) wait on this card until it's ready.
  const planFinished = planStatus === "ready" || planStatus === "done";
  const leaveForm = () => {
    if (form === "asked" && !planFinished) setFinishing(true);
    else fadeOut();
  };
  useEffect(() => {
    if (!finishing) return;
    if (planFinished) {
      fadeOut();
      return;
    }
    // Never strand anyone here: after a minute and a half, go to the map, where the chat keeps working.
    const giveUp = setTimeout(fadeOut, 90_000);
    return () => clearTimeout(giveUp);
  }, [finishing, planFinished, fadeOut]);

  // The hello pops in like a new message (no pop with animations off).
  useEffect(() => {
    if (!chat) return;
    if (!motion) {
      pop.setValue(1);
      return;
    }
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: NATIVE_DRIVER }).start();
  }, [chat, motion, pop]);
  const popStyle = {
    opacity: pop,
    transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }, { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  // Geesling's place is an empty spot beside the bubble: measure it and the shell, and fly (or jump) there, shrinking
  // to PERCH_PX. Re-run when the window changes size so it stays put. The hello pops in when it lands.
  const flown = useRef(false);
  useEffect(() => {
    if (perch === "none" || stage !== "hatched") return;
    let cancelled = false;
    const frame = setTimeout(() => {
      const slot = slotRef.current;
      const base = baseRef.current;
      if (!slot || !base) {
        setChat(true);
        return;
      }
      slot.measureInWindow((sx, sy, sw, sh) => {
        base.measureInWindow((bx, by, _bw, bh) => {
          if (cancelled) return;
          const gooseW = 14 * px;
          const gooseH = 16 * px;
          // Centre to centre; the sprite scales about its own centre, so the move isn't scaled.
          const dx = sx + sw / 2 - (bx + gooseW / 2);
          const dy = sy + sh / 2 - (by + bh - 5 * px - gooseH / 2);
          const scale = PERCH_PX / px;
          if (perch === "fly" && !flown.current && motion) {
            flown.current = true;
            Animated.parallel([
              Animated.timing(gooseX, { toValue: dx, duration: FLY_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
              Animated.timing(gooseY, { toValue: dy, duration: FLY_MS, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER }),
              Animated.timing(gooseScale, { toValue: scale, duration: FLY_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
            ]).start(() => setChat(true));
          } else {
            flown.current = true;
            gooseX.setValue(dx);
            gooseY.setValue(dy);
            gooseScale.setValue(scale);
            setChat(true);
          }
        });
      });
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(frame);
    };
    // `height` matters too: the chat is centred on screen.
  }, [perch, stage, width, height, px, motion, gooseX, gooseY, gooseScale]);

  // "Skip intro": straight to the end of the scene, Geesling hovering over its shell, with the chat open.
  const skipIntro = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    roll.setValue(1);
    hatch(true);
    setPose("fly");
    setCapOff(true);
    capDrop.setValue(1);
    setPerch("now");
  };

  // The egg rolls in (or, with Reduce Motion, Geesling is already up).
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce || !motion) {
        roll.setValue(1);
        hatch(true);
        setPose("fly");
        setCapOff(true);
        capDrop.setValue(1);
        setPerch("now");
        return;
      }
      // Rolls in, wiggles, cracks twice and hatches on its own; Geesling steps out and flies up, and the chat opens.
      Animated.timing(roll, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER }).start();
      later(1300, () => buzz("tap"));
      later(1600, () => wiggleOnce(8, 70));
      later(2050, () => { setStage("cracked"); play("crack"); buzz("crack"); });
      later(2500, () => wiggleOnce(12, 60));
      later(2950, () => { setStage("split"); play("crack"); buzz("crack"); });
      later(3300, () => wiggleOnce(16, 45));
      later(3700, () => hatch());
      later(4500, stepOut);
      later(FLY_AT, flyUp);
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
            style={[styles.askArea, { top: insets.top + 50, bottom: form || plannerVibe ? STAGE_BOTTOM + 12 : STAGE_BOTTOM + 10 * px + 12 }]}
            pointerEvents="box-none"
          >
            {form ? (
              <Panel style={[styles.askCard, styles.formCard]} shadow={4}>
                {finishing ? (
                  // The loading page after the form: Geesling finishing the route.
                  <View style={styles.finishing} accessibilityLiveRegion="polite">
                    <Text style={styles.speaker}>GEESLING</Text>
                    <Goose size={4} walking={false} flapping />
                    <Text style={[styles.line, styles.centered]} accessibilityRole="header">Thanks! Finishing your route…</Text>
                    <Text style={[styles.progressText, styles.centered]}>{planStatus && !planFinished ? `${planStatus}…` : "Almost there…"}</Text>
                  </View>
                ) : (
                  <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
                    <Text style={styles.speaker}>GEESLING</Text>
                    <Text style={styles.line} accessibilityRole="header">
                      {form === "asked"
                        ? profile
                          ? "On it! While I plan your route, check your details are still right."
                          : "On it! While I plan your route, tell me a little about you."
                        : profile
                          ? "Before you explore, check your details are still right."
                          : "Before you explore, tell me a little about you."}
                    </Text>
                    {/* While they fill this in, Geesling's planning carries on; its progress shows here. */}
                    {form === "asked" ? (
                      <View style={[styles.progress, planStatus === "ready" && styles.progressDone]} accessibilityLiveRegion="polite">
                        {planFinished ? (
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
                    {/* Keyed so details that arrive after the form opened still fill it in. */}
                    <AboutYouForm key={profile ? "known" : "new"} initial={profile} onSaved={leaveForm} secondary={{ label: "Skip for now", onPress: leaveForm }} />
                  </ScrollView>
                )}
              </Panel>
            ) : plannerVibe ? (
              <ScrollView style={styles.plannerScroll} contentContainerStyle={styles.plannerContent} keyboardShouldPersistTaps="handled">
                <PlannerFlow initialVibe={plannerVibe} userLocation={userLocation} onLocate={onLocate} onSubmit={send} onCancel={() => setPlannerVibe(null)} />
              </ScrollView>
            ) : (
              <ScrollView pointerEvents={chat ? "auto" : "none"} style={styles.threadScroll} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled" accessibilityLabel="Chat with Geesling">
                <View style={styles.geeslingRow}>
                  {/* Geesling's place: it flies here from its shell. */}
                  <View ref={slotRef} style={styles.slot} />
                  <Animated.View style={[styles.bubble, styles.geeslingBubble, popStyle]}>
                    <Text style={styles.speaker}>GEESLING</Text>
                    <Text style={styles.line} accessibilityRole="header" accessibilityLiveRegion="polite">
                      {chat ? HELLO : ""}
                      {/* Holds the bubble at full size before it opens, so Geesling's place doesn't move. */}
                      {chat ? null : <Text style={styles.unseen}>{HELLO}</Text>}
                    </Text>
                  </Animated.View>
                </View>
                <Animated.View style={[styles.replies, popStyle]}>
                    {SHORTCUT_VIBES.map((id) => {
                      const v = VIBES.find((x) => x.id === id);
                      return v ? <PixelButton key={id} label={v.label} icon={v.icon} small tone={id === "surprise" ? "gold" : undefined} onPress={() => pickVibe(id)} /> : null;
                    })}
                  </Animated.View>
                  <Animated.View style={[styles.userRow, popStyle]}>
                    <View style={[styles.bubble, styles.userBubble]}>
                      <TextInput
                        value={prompt}
                        onChangeText={setPrompt}
                        placeholder={EXAMPLES[example]}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        placeholderTextColor={colors.wood}
                        style={styles.input}
                        multiline
                        maxLength={1200}
                        accessibilityLabel="Tell Geesling what you're in the mood for or your budget"
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
                    </View>
                    <View style={styles.askRow}>
                      <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel="Skip to the live map" hitSlop={8} style={styles.mapLinkPill}>
                        <Text style={styles.mapLink}>or skip to the live map →</Text>
                      </Pressable>
                      <PixelButton label="Send" tone="red" disabled={!prompt.trim()} onPress={ask} />
                    </View>
                  </Animated.View>
              </ScrollView>
            )}
          </KeyboardAvoidingView>

          <View style={styles.stage} pointerEvents="box-none">
            {stage === "hatched" ? (
              <View ref={baseRef} style={{ width: eggWidth, height: 8 * px }}>
                {/* Geesling sits 3 pixels down inside the bottom shell until it steps out. */}
                {/* Hidden while the planner or the form covers the chat (the planner shows its own Geesling). */}
                <Animated.View
                  style={[
                    styles.goose,
                    { bottom: 5 * px, zIndex: pose === "sit" ? 1 : 4, opacity: plannerVibe || form ? 0 : 1, transform: [{ translateX: gooseX }, { translateY: gooseY }, { scale: gooseScale }] },
                  ]}
                >
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

          {/* Small, out of the way: for people who've seen the egg before. */}
          {!chat && !revealed ? (
            <Pressable onPress={skipIntro} style={[styles.skipIntro, { bottom: insets.bottom + 10 }]} accessibilityRole="button" accessibilityLabel="Skip intro" hitSlop={10}>
              <Text style={[styles.skipIntroText, nightMode && styles.skipIntroNight]}>Skip intro →</Text>
            </Pressable>
          ) : null}

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
  askCard: { width: "100%", maxWidth: 480, maxHeight: "100%", padding: 16, backgroundColor: colors.paper },
  speaker: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accent, letterSpacing: 1 },
  formCard: { maxHeight: "100%" },
  plannerScroll: { width: "100%", maxWidth: 520, maxHeight: "100%" },
  plannerContent: { flexGrow: 1, justifyContent: "center", paddingVertical: 4 },
  vibeLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink, letterSpacing: 1, marginTop: 2 },
  vibes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skipIntro: { position: "absolute", right: 16, zIndex: 7 },
  skipIntroText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textDecorationLine: "underline" },
  skipIntroNight: { color: "#E8D6A7" },
  threadScroll: { width: "100%", maxWidth: 480, maxHeight: "100%" },
  thread: { flexGrow: 1, justifyContent: "center", gap: 10, paddingVertical: 4 },
  geeslingRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  slot: { width: PERCH_W, height: PERCH_H },
  unseen: { opacity: 0 },
  // Message bubbles: Geesling's on the left with its tail at the bottom left, the person's on the right.
  bubble: { borderWidth: 3, borderColor: colors.ink, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  geeslingBubble: { flexShrink: 1, gap: 4, backgroundColor: colors.paper, borderBottomLeftRadius: 3 },
  userRow: { gap: 8 },
  userBubble: { alignSelf: "flex-end", width: "88%", backgroundColor: colors.gold, borderBottomRightRadius: 3, paddingVertical: 4, paddingHorizontal: 6 },
  replies: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingLeft: PERCH_W + 8 },
  mapLinkPill: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 8, paddingVertical: 4 },
  line: { fontFamily: fonts.body, fontSize: 17, lineHeight: 23, color: colors.ink },
  progress: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.parchment, borderWidth: 2, borderColor: colors.ink, padding: 8 },
  progressDone: { backgroundColor: "#E2EFD0" },
  finishing: { alignItems: "center", gap: 12, paddingVertical: 12 },
  centered: { textAlign: "center" },
  progressText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.ink },
  input: { minHeight: 60, maxHeight: 140, backgroundColor: "transparent", paddingHorizontal: 8, paddingVertical: 8, fontFamily: fonts.body, fontSize: 16, color: colors.ink, textAlignVertical: "top" },
  askRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  mapLink: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, textDecorationLine: "underline" },
  decor: { position: "absolute" },
});
