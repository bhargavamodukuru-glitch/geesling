import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Panel, PixelButton, Tag } from "@/components/Pixel";
import { useSaved } from "@/hooks/useSaved";
import { clock, distance, minutes, priceLabel } from "@/lib/format";
import { openWalkInMaps, shareWalk } from "@/lib/links";
import { costLine, formatDuration, summarizePlan, travelLine } from "@/lib/planSummary";
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

  return (
    <Panel tone="parchment" style={styles.card}>
      <Text style={styles.title}>{walk.title}</Text>
      <View style={styles.summary} accessibilityLabel="Plan summary">
        <Text style={styles.summaryTitle}>
          ⏱️ {formatDuration(summary.totalMinutes)} total · {summary.stops} stop{summary.stops === 1 ? "" : "s"}
        </Text>
        <Text style={text.small}>
          {travelLine(summary)} · {formatDuration(summary.stopMinutes)} at stops
          {summary.waitMinutes ? ` · about ${formatDuration(summary.waitMinutes)} waiting for an event to start` : ""}
        </Text>
        <Text style={styles.summaryRow}>💵 {costLine(summary.cost)}</Text>
        {summary.bookAhead.length ? <Text style={[styles.summaryRow, styles.book]}>🎟️ Book ahead: {summary.bookAhead.join(", ")}</Text> : null}
      </View>

      {walk.stops.map((stop) => (
        <View key={stop.order}>
          {stop.leg ? (
            <Text style={styles.leg}>
              {stop.leg.mode === "transit" ? `🚋 TTC ${stop.leg.transit_lines.join(" → ")}` : "🦶 Walk"} {minutes(stop.leg.duration_s)} · {distance(stop.leg.distance_m)}
              {stop.leg.estimated ? " (approx.)" : ""}
            </Text>
          ) : null}
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
              </Text>
              {stop.item.kind === "event" && stop.item.rsvp_required ? <Tag label="🎟️ RSVP ahead" color={colors.accent} /> : null}
              <Text style={text.small}>{stop.why}</Text>
            </View>
          </Pressable>
        </View>
      ))}

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
        <PixelButton label={saved ? "Saved" : "Save walk"} icon={saved ? "★" : "☆"} small active={saved} onPress={() => void toggle("walk", walk.id, walk)} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.accent },
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
