import { StyleSheet, Text, View } from "react-native";
import { Goose } from "@/components/Goose";
import { colors, fonts } from "@/lib/theme";

export function GeeslingLoader({ label = "Geesling is finding your way…" }: { label?: string }) {
  return (
    <View style={styles.screen} accessibilityRole="progressbar" accessibilityLabel={label}>
      <Goose size={7} walking={false} flapping />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 220, alignItems: "center", justifyContent: "center", gap: 28, backgroundColor: colors.parchment },
  label: { color: colors.ink, fontFamily: fonts.heading, fontSize: 20, textAlign: "center", paddingHorizontal: 24 },
});
