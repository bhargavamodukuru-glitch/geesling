import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { colors, fonts, pixelShadow } from "@/lib/theme";

interface PanelProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "paper" | "parchment" | "wood";
  shadow?: number;
}

/** Bordered menu panel with a hard pixel shadow. */
export function Panel({ children, style, tone = "paper", shadow = 4 }: PanelProps) {
  const backgroundColor = tone === "wood" ? colors.wood : tone === "parchment" ? colors.parchment : colors.paper;
  return <View style={[styles.panel, { backgroundColor }, pixelShadow(shadow), style]}>{children}</View>;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: string;
  tone?: "paper" | "gold" | "green" | "purple" | "red" | "wood";
  active?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

const TONES: Record<NonNullable<ButtonProps["tone"]>, { bg: string; fg: string }> = {
  paper: { bg: colors.paper, fg: colors.ink },
  gold: { bg: colors.gold, fg: colors.ink },
  green: { bg: colors.free, fg: colors.white },
  purple: { bg: colors.paid, fg: colors.white },
  red: { bg: colors.accent, fg: colors.white },
  wood: { bg: colors.wood, fg: colors.paper },
};

export function PixelButton({ label, onPress, icon, tone = "paper", active, disabled, small, style, textStyle, accessibilityLabel }: ButtonProps) {
  const t = active ? TONES.gold : TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected: active }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: t.bg, opacity: disabled ? 0.5 : 1 },
        pressed ? { transform: [{ translateX: 2 }, { translateY: 2 }] } : pixelShadow(small ? 2 : 3),
        style,
      ]}
    >
      <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: t.fg }, textStyle]} numberOfLines={1}>
        {icon ? `${icon} ` : ""}
        {label}
      </Text>
    </Pressable>
  );
}

export function Tag({ label, color, textColor = colors.white }: { label: string; color: string; textColor?: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: color }]}>
      <Text style={[styles.tagText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 3,
    borderColor: colors.ink,
    padding: 12,
  },
  button: {
    borderWidth: 3,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSmall: {
    borderWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  buttonText: {
    fontFamily: fonts.body,
    fontSize: 19,
    lineHeight: 21,
  },
  buttonTextSmall: {
    fontSize: 16,
    lineHeight: 18,
  },
  tag: {
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: "flex-start",
  },
  tagText: {
    fontFamily: fonts.headingRegular,
    fontSize: 11,
  },
});
