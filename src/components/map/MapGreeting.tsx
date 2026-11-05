import { useEffect, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { Goose } from "@/components/Goose";
import { Panel, PixelButton } from "@/components/Pixel";
import { colors, fonts, text } from "@/lib/theme";

interface Props {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}

const NATIVE_DRIVER = Platform.OS !== "web";

/** Geesling hovering in place over the map, wings flapping, with a line in a speech box. */
export function MapGreeting({ message, actionLabel, onAction, onClose }: Props) {
  const [appear] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(1.6)), useNativeDriver: NATIVE_DRIVER }).start();
  }, [appear]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View style={[styles.row, { opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
        {/* Hovering in place, wings flapping. */}
        <View pointerEvents="none">
          <Goose size={3} walking={false} flapping />
        </View>
        <Panel style={styles.bubble} shadow={3}>
          <View style={styles.header}>
            <Text style={styles.speaker}>GEESLING</Text>
            <PixelButton label="✕" small onPress={onClose} accessibilityLabel="Close Geesling's message" />
          </View>
          <Text style={text.body} accessibilityLiveRegion="polite">{message}</Text>
          {actionLabel && onAction ? <PixelButton label={actionLabel} tone="red" small onPress={onAction} style={styles.action} /> : null}
        </Panel>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 10, right: 10, top: 10, alignItems: "center", zIndex: 15 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 6, maxWidth: 460, width: "100%", paddingTop: 8 },
  bubble: { flex: 1, gap: 4, padding: 10, backgroundColor: colors.paper },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  speaker: { fontFamily: fonts.heading, fontSize: 12, color: colors.accent, letterSpacing: 1 },
  action: { alignSelf: "flex-start", marginTop: 4 },
});
