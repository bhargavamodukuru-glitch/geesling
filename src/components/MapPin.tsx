import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { pinLabel } from "@/lib/format";
import { isTopRated } from "@/lib/placeBadges";
import { CATEGORY_LABELS, colors, fonts } from "@/lib/theme";
import type { MapItem } from "@/lib/types";

interface Props {
  item: MapItem;
  order?: number; // walk stop number
  selected?: boolean;
}

function placeEmoji(types: string[]): string {
  if (types.includes("photography_spot")) return "📸";
  if (types.some((t) => /bar|pub|brewery|night_club|wine/.test(t))) return "🍺";
  if (types.some((t) => /bakery|dessert|ice_cream|chocolate|donut|confection/.test(t))) return "🧁";
  if (types.some((t) => /cafe|coffee|tea/.test(t))) return "☕";
  if (types.some((t) => /restaurant|food|meal/.test(t))) return "🍜";
  if (types.some((t) => /clothing|thrift|second_hand|store|shop|market/.test(t))) return "🛍️";
  if (types.some((t) => /park|garden|beach|hiking/.test(t))) return "🌳";
  if (types.some((t) => /museum|gallery|art/.test(t))) return "🖼️";
  if (types.some((t) => /book/.test(t))) return "📚";
  return "📍";
}

function PinView({ item, order, selected }: Props) {
  const free = item.is_free;
  const isPhotoSpot = item.kind === "place" && item.types.includes("photography_spot");
  const bg = isPhotoSpot ? colors.photoPin : free ? colors.free : colors.paid;
  const border = selected ? colors.gold : colors.ink;
  const icon = order !== undefined ? String(order) : item.kind === "event" ? (CATEGORY_LABELS[item.categories[0]]?.emoji ?? "⭐") : placeEmoji(item.types);
  const label = item.kind === "event" ? pinLabel(item) : null;
  const live = item.kind === "event" && item.is_live;
  const topRated = isTopRated(item);

  return (
    <View style={styles.wrap} pointerEvents="none">
      {label ? (
        <View style={[styles.label, { backgroundColor: live ? colors.live : colors.gold }]}>
          <Text style={[styles.labelText, { color: live ? colors.white : colors.ink }]}>{label}</Text>
        </View>
      ) : (
        <View style={styles.labelSpacer} />
      )}
      <View style={styles.row}>
        <View style={styles.sideSpacer} />
        <View style={[styles.pin, { backgroundColor: bg, borderColor: border, transform: [{ scale: selected ? 1.15 : 1 }] }]}>
          <Text style={order !== undefined ? styles.orderText : styles.icon}>{icon}</Text>
          {topRated ? (
            <View style={styles.starBadge}>
              <Text style={styles.starText}>★</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.side}>{item.involves_alcohol ? <Text style={styles.cheers}>🍻</Text> : null}</View>
      </View>
      <View style={[styles.pointer, { borderTopColor: border }]} />
    </View>
  );
}

export const MapPin = memo(PinView);

export const PIN_WIDTH = 84;
export const PIN_HEIGHT = 64;

const styles = StyleSheet.create({
  wrap: { width: PIN_WIDTH, height: PIN_HEIGHT, alignItems: "center", justifyContent: "flex-end" },
  label: { borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 4, marginBottom: 2 },
  labelSpacer: { height: 18 },
  labelText: { fontFamily: fonts.body, fontSize: 18, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center" },
  sideSpacer: { width: 22 },
  side: { width: 22, alignItems: "flex-start" },
  cheers: { fontSize: 15, marginLeft: 2 },
  pin: { width: 30, height: 30, borderWidth: 3, alignItems: "center", justifyContent: "center", overflow: "visible" },
  // Gold star on places rated above 4.5 (see lib/placeBadges.ts).
  starBadge: { position: "absolute", top: -10, right: -10, width: 18, height: 18, backgroundColor: colors.gold, borderWidth: 2, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  starText: { fontSize: 12, lineHeight: 14, color: colors.ink },
  icon: { fontSize: 14 },
  orderText: { fontFamily: fonts.body, fontSize: 24, lineHeight: 24, color: colors.white },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
