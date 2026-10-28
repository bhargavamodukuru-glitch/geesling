import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";

interface Props {
  now: Date;
  dark: boolean;
  onToggle: () => void;
}

const dateLabel = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Toronto" });
const timeLabel = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Toronto" });

/** Toronto's date and time over the map, with the day/night switch beside it. */
export function ClockChip({ now, dark, onToggle }: Props) {
  return (
    <View style={styles.row} pointerEvents="box-none">
      <View style={[styles.chip, dark && styles.chipDark]} accessibilityRole="text">
        <Text style={[styles.clock, dark && styles.clockDark]}>
          TORONTO · {dateLabel.format(now)} · {timeLabel.format(now)}
        </Text>
      </View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={dark ? "Switch to light mode" : "Switch to dark mode"}
        style={[styles.chip, styles.toggle, dark && styles.chipDark]}
      >
        <Text style={[styles.toggleText, dark && styles.clockDark]}>{dark ? "☀ DAY" : "☾ NIGHT"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: "absolute", top: 8, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  chip: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 1 },
  chipDark: { backgroundColor: "#34435D", borderColor: "#D8C59A" },
  clock: { fontFamily: fonts.body, fontSize: 16, color: colors.wood, letterSpacing: 0.3 },
  clockDark: { color: "#FFF8E6" },
  toggle: { flexShrink: 0 },
  toggleText: { fontFamily: fonts.heading, fontSize: 12, color: colors.ink },
});
