import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Goose } from "@/components/Goose";
import { PixelButton } from "@/components/Pixel";
import { colors, fonts } from "@/lib/theme";

interface Props {
  onNearMe?: () => void;
  onRefresh?: () => void;
  locating?: boolean;
  collapsible?: boolean;
}

const dateLabel = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric" });

export function Header({ onNearMe, onRefresh, locating, collapsible = false }: Props) {
  const [collapsed, setCollapsed] = useState(collapsible);

  if (collapsed) {
    return (
      <View style={[styles.bar, styles.collapsedBar]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Geesling header"
          accessibilityHint="Shows the Toronto date and map controls"
          onPress={() => setCollapsed(false)}
          style={styles.gooseButton}
        >
          <Goose size={2} walking={false} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole={collapsible ? "button" : undefined}
        accessibilityLabel={collapsible ? "Collapse Geesling header" : undefined}
        onPress={collapsible ? () => setCollapsed(true) : undefined}
        style={styles.gooseButton}
      >
        <Goose size={2} walking={false} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>GEESLING</Text>
        <Text style={styles.sub}>Toronto · {dateLabel.format(new Date())}</Text>
      </View>
      {onNearMe ? <PixelButton label={locating ? "Finding…" : "Near me"} icon="⌖" small onPress={onNearMe} /> : null}
      {onRefresh ? <PixelButton label="↻" small onPress={onRefresh} accessibilityLabel="Refresh events" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.paper,
    borderBottomWidth: 3,
    borderColor: colors.ink,
  },
  collapsedBar: { alignItems: "flex-start", paddingHorizontal: 8, paddingVertical: 5 },
  gooseButton: { alignItems: "center", justifyContent: "center", padding: 2 },
  title: { fontFamily: fonts.heading, fontSize: 20, color: colors.accent, letterSpacing: 2 },
  sub: { fontFamily: fonts.body, fontSize: 17, color: colors.inkSoft, marginTop: -2 },
});
