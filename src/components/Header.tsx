import { StyleSheet, Text, View } from "react-native";
import { Goose } from "@/components/Goose";
import { PixelButton } from "@/components/Pixel";
import { colors, fonts } from "@/lib/theme";

interface Props {
  onRefresh?: () => void;
}

const dateLabel = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric" });

export function Header({ onRefresh }: Props) {
  return (
    <View style={styles.bar}>
      <Goose size={2} walking={false} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>GEESLING</Text>
        <Text style={styles.sub}>Toronto · {dateLabel.format(new Date())}</Text>
      </View>
      {onRefresh ? <PixelButton label="↻" small onPress={onRefresh} accessibilityLabel="Refresh events" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: colors.paper,
    borderTopWidth: 3,
    borderColor: colors.ink,
  },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.accent, letterSpacing: 2 },
  sub: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft, marginTop: -2 },
});
