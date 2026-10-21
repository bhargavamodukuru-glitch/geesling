import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Panel, PixelButton, Tag } from "@/components/Pixel";
import { useSaved } from "@/hooks/useSaved";
import { clock, distance, minutes, priceLabel } from "@/lib/format";
import { openWalkInMaps, shareWalk } from "@/lib/links";
import { DAY_PART_LABEL, SPLIT_WALK_MINUTES, dayPart } from "@/lib/dayParts";
import { costLine, formatDuration, runLine, summarizePlan, travelLine } from "@/lib/planSummary";
import { isTopRated } from "@/lib/placeBadges";
import { transitLabel, transitSteps } from "@/lib/transit";
import { colors, fonts, text } from "@/lib/theme";
import { itemTitle, type MapItem, type Walk } from "@/lib/types";

interface Props {
  walk: Walk;
  onShowOnMap?: (walk: Walk) => void;
  onSelectStop?: (item: MapItem, why: string) => void;
}

export function WalkCard({ walk, onShowOnMap, onSelectStop }: Props) {
  const { isSaved, toggle } = useSaved();
  const [shareNote, setShareNote] = useState<string | null>(null);
  const saved = isSaved("walk", walk.id);
  const summary = useMemo(() => summarizePlan(walk), [walk]);
  // Long walks are shown in parts of the day, with a header wherever the part changes.
  const isRun = walk.activity === "run";
  const split = !isRun && summary.totalMinutes >= SPLIT_WALK_MINUTES;

  return (
    <Panel tone="parchment" style={styles.card}>
      <Text style={styles.title}>{walk.title}</Text>
      <View style={styles.summary} accessibilityLabel="Plan summary">
        <Text style={styles.summaryTitle}>
          ⏱️ {formatDuration(summary.totalMinutes)} total · {summary.stops} stop{summary.stops === 1 ? "" : "s"}
        </Text>
        {isRun ? <Text style={styles.summaryRow}>{runLine(walk)}</Text> : null}
        {isRun ? null : (
          <Text style={text.small}>
            {travelLine(summary)} · {formatDuration(summary.stopMinutes)} at stops
            {summary.waitMinutes ? ` · about ${formatDuration(summary.waitMinutes)} of free time between stops` : ""}
          </Text>
        )}
        <Text style={styles.summaryRow}>💵 {costLine(summary.cost)}</Text>
        {summary.bookAhead.length ? <Text style={[styles.summaryRow, styles.book]}>🎟️ Book ahead: {summary.bookAhead.join(", ")}</Text> : null}
      </View>

      {walk.stops.map((stop, i) => {
        const part = dayPart(stop.arrive_at);
        const newPart = split && (i === 0 || dayPart(walk.stops[i - 1].arrive_at) !== part);
        // Time between getting there and the stop starting: doors not open yet, or a meal set for later.
        const reached = i === 0 ? null : Date.parse(walk.stops[i - 1].leave_at) + (stop.leg?.duration_s ?? 0) * 1000;
        const freeMinutes = reached === null ? 0 : Math.round((Date.parse(stop.arrive_at) - reached) / 60_000);
        return (
          <View key={stop.order}>
            {newPart ? <Text style={styles.part}>{DAY_PART_LABEL[part]}</Text> : null}
            {stop.leg ? (
              <Text style={styles.leg}>
                {stop.leg.mode === "transit" ? `TTC: ${stop.leg.transit_lines.map(transitLabel).join(" → ") || "🚌 transit"}` : isRun ? "🏃 Run" : "🦶 Walk"} {minutes(stop.leg.duration_s)} · {distance(stop.leg.distance_m)}
                {stop.leg.estimated ? " (approx.)" : ""}
              </Text>
            ) : null}
            {/* Where to walk, board and get off, when the guide saved the ride's stops. */}
            {stop.leg?.mode === "transit"
              ? transitSteps(stop.leg).map((step, n) => (
                  <Text key={n} style={styles.transitStep}>
                    {step}
                  </Text>
                ))
              : null}
            {freeMinutes >= 15 ? <Text style={styles.leg}>☕ Free time {formatDuration(freeMinutes)}</Text> : null}
            <Pressable
              onPress={() => onSelectStop?.(stop.item, stop.why)}
              accessibilityRole="button"
              accessibilityLabel={`Stop ${stop.order}: ${itemTitle(stop.item)}`}
              style={styles.stop}
            >
              <View style={[styles.badge, { backgroundColor: stop.item.is_free ? colors.free : colors.paid }]}>
                <Text style={styles.badgeText}>{stop.order}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.stopTitle} numberOfLines={2}>
                  {itemTitle(stop.item)}
                  {stop.item.involves_alcohol ? " 🍻" : ""}
                </Text>
                <Text style={text.small}>
                  {clock(stop.arrive_at)}–{clock(stop.leave_at)} · {priceLabel(stop.item)}
                  {stop.item.kind === "place" && isTopRated(stop.item) ? ` · ★ ${stop.item.rating}` : ""}
                </Text>
                {stop.item.kind === "event" && stop.item.rsvp_required ? <Tag label="🎟️ RSVP ahead" color={colors.accent} /> : null}
                <Text style={text.small}>{stop.why}</Text>
              </View>
            </Pressable>
          </View>
        );
      })}

      {walk.outro ? <Text style={[text.body, styles.outro]}>“{walk.outro}”</Text> : null}

      <View style={styles.actions}>
        {onShowOnMap ? <PixelButton label="Show on map" icon="🗺️" tone="gold" small onPress={() => onShowOnMap(walk)} /> : null}
        <PixelButton label="Open in Maps" icon="🧭" small onPress={() => openWalkInMaps(walk)} />
        <PixelButton
          label={shareNote ?? "Share"}
          icon="📤"
          small
          onPress={() =>
            void shareWalk(walk)
              .then((r) => setShareNote(r === "copied" ? "Link copied!" : null))
              .catch(() => setShareNote(null))
          }
        />
        <PixelButton label={saved ? "Saved" : "Save route"} icon={saved ? "★" : "☆"} small active={saved} onPress={() => void toggle("walk", walk.id, walk)} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.accent },
  part: { fontFamily: fonts.heading, fontSize: 13, color: colors.accent, marginTop: 6, letterSpacing: 1 },
  transitStep: { fontFamily: fonts.body, fontSize: 16, lineHeight: 18, color: colors.inkSoft, marginLeft: 48, marginBottom: 2 },
  leg: { fontFamily: fonts.body, fontSize: 17, color: colors.wood, marginLeft: 36, marginVertical: 2 },
  stop: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink, padding: 6 },
  badge: { width: 26, height: 26, borderWidth: 2, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.body, color: colors.white, fontSize: 22, lineHeight: 22 },
  stopTitle: { fontFamily: fonts.heading, fontSize: 14, color: colors.ink },
  summary: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink, padding: 8, gap: 3 },
  summaryTitle: { fontFamily: fonts.heading, fontSize: 14, color: colors.ink },
  summaryRow: { fontFamily: fonts.body, fontSize: 19, lineHeight: 20, color: colors.ink },
  book: { color: colors.accent },
  outro: { fontStyle: "italic" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
});
