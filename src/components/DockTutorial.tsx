import { StyleSheet, Text, View } from "react-native";
import { Goose } from "@/components/Goose";
import { Panel, PixelButton } from "@/components/Pixel";
import { colors, fonts, text } from "@/lib/theme";

export interface TutorialStep {
  title: string;
  body: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "📍 Happening",
    body: "Everything going on in Toronto right now. Tap a pin or open the list for details, and use Filters or Date to see what’s on later.",
  },
  {
    title: "⭐ Saved",
    body: "Found something good? Tap ☆ on any spot or route and I’ll keep it here for later.",
  },
  {
    title: "🪿 Ask",
    body: "Tell me your vibe and how much time you’ve got, and I’ll plan you a route: real events plus spots that are always open.",
  },
  {
    title: "💬 Feedback",
    body: "Something broken, or a great idea? Tell the team here. Geesling is in beta and we read everything.",
  },
];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  step: number;
  /** Where the tile for this step sits on screen. */
  target: Rect;
  screen: { width: number; height: number };
  /** Distance from the bottom of the screen to the top of the menu. */
  cardBottom: number;
  onNext: () => void;
  onSkip: () => void;
}

const DIM = "rgba(20, 12, 4, 0.62)";

/** First-run tour: the screen dims except one menu tile, and Geesling explains what it does. */
export function DockTutorial({ step, target, screen, cardBottom, onNext, onSkip }: Props) {
  const current = TUTORIAL_STEPS[step];
  const last = step === TUTORIAL_STEPS.length - 1;
  const pad = 4;
  const hole = { x: target.x - pad, y: target.y - pad, width: target.width + pad * 2, height: target.height + pad * 2 };
  // The pointer under the speech box lines up with the middle of the tile, kept inside the box.
  const arrowX = Math.min(Math.max(target.x + target.width / 2 - 10, 28), screen.width - 48);

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} accessibilityViewIsModal>
      {/* Four dim panels around the highlighted tile, so it stays lit and everything else is shaded. Taps here do nothing. */}
      <View style={[styles.dim, { top: 0, left: 0, right: 0, height: hole.y }]} />
      <View style={[styles.dim, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} />
      <View style={[styles.dim, { top: hole.y, left: 0, width: hole.x, height: hole.height }]} />
      <View style={[styles.dim, { top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height }]} />
      <View pointerEvents="none" style={[styles.ring, { top: hole.y, left: hole.x, width: hole.width, height: hole.height }]} />

      <View style={[styles.cardWrap, { bottom: cardBottom + 18 }]}>
        <View style={styles.goose}>
          <Goose size={3} walking={false} flapping />
        </View>
        <Panel style={styles.card} shadow={4}>
          <View style={styles.header}>
            <Text style={styles.speaker}>GEESLING</Text>
            <Text style={styles.count}>
              {step + 1} of {TUTORIAL_STEPS.length}
            </Text>
          </View>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={text.body} accessibilityLiveRegion="polite">{current.body}</Text>
          <View style={styles.buttons}>
            {!last ? <PixelButton label="Skip" small onPress={onSkip} accessibilityLabel="Skip the tour" /> : <View />}
            <PixelButton label={last ? "Let’s go!" : "Next"} tone="red" small onPress={onNext} />
          </View>
        </Panel>
        <View style={[styles.arrow, { left: arrowX - 16 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Over the menu and sheets, under the intro.
  root: { zIndex: 40 },
  dim: { position: "absolute", backgroundColor: DIM },
  ring: { position: "absolute", borderWidth: 3, borderColor: colors.gold, borderRadius: 14 },
  cardWrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  goose: { alignSelf: "flex-start", marginLeft: 8, marginBottom: -6, zIndex: 2 },
  card: { width: "100%", maxWidth: 440, gap: 6, padding: 14, backgroundColor: colors.paper },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  speaker: { fontFamily: fonts.heading, fontSize: 12, color: colors.accent, letterSpacing: 1 },
  count: { fontFamily: fonts.body, fontSize: 16, color: colors.inkSoft },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  buttons: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  // A square turned 45° under the box, pointing down at the tile.
  arrow: { position: "absolute", bottom: -9, width: 18, height: 18, backgroundColor: colors.paper, borderRightWidth: 3, borderBottomWidth: 3, borderColor: colors.ink, transform: [{ rotate: "45deg" }] },
});
