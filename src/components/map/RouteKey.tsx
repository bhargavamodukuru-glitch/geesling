import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts } from "@/lib/theme";
import type { Walk } from "@/lib/types";

/** Small key for a walk's route lines (placed below the home screen's walk banner; pass `style` to move it): solid red is a TTC ride, dashed brown is walking. Same colours as the map. */
export function RouteKey({ walk, style }: { walk: Walk; style?: StyleProp<ViewStyle> }) {
  const legs = walk.stops.map((s) => s.leg).filter((leg) => leg?.polyline);
  if (!legs.length) return null;
  const transit = legs.some((leg) => leg!.mode === "transit");
  return (
    <View style={[styles.key, style]} accessibilityLabel={transit ? "Map key: solid red line is a TTC ride, dashed brown line is walking" : "Map key: dashed brown line is walking"}>
      {transit ? (
        <View style={styles.row}>
          <View style={[styles.solid, { backgroundColor: colors.accent }]} />
          <Text style={styles.label}>TTC ride</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.dashes}>
          {[0, 1, 2].map((i) => <View key={i} style={styles.dash} />)}
        </View>
        <Text style={styles.label}>{walk.activity === "run" ? "Run" : "Walk"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  key: { position: "absolute", top: 62, left: 10, gap: 3, backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 8, paddingVertical: 5 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  solid: { width: 24, height: 4 },
  dashes: { width: 24, flexDirection: "row", justifyContent: "space-between" },
  dash: { width: 5, height: 4, backgroundColor: colors.woodDark },
  label: { fontFamily: fonts.body, fontSize: 16, lineHeight: 16, color: colors.ink },
});
