import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Goose } from "@/components/Goose";
import { Panel, PixelButton } from "@/components/Pixel";
import { TorontoPixelBackdrop } from "@/components/TorontoPixelBackdrop";
import { colors, fonts, text } from "@/lib/theme";

interface Props {
  onAsk: (prompt: string) => void;
  onSkip: () => void;
}

export function GeeslingWelcome({ onAsk, onSkip }: Props) {
  const [prompt, setPrompt] = useState("");
  const [nightMode, setNightMode] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const torontoDate = new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  }).format(now);
  const torontoTime = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  }).format(now);
  const submit = () => {
    const value = prompt.trim();
    if (value) onAsk(value);
  };

  return (
    <SafeAreaView style={[styles.screen, nightMode && styles.nightScreen]} edges={["top", "left", "right", "bottom"]}>
      <TorontoPixelBackdrop nightMode={nightMode} />
      <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.metaRow}>
            <Text style={[styles.clock, nightMode && styles.nightClock]}>
              TORONTO · {torontoDate} · {torontoTime}
            </Text>
            <Pressable
              onPress={() => setNightMode((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${nightMode ? "day" : "night"} scene`}
              style={[styles.sceneToggle, nightMode && styles.nightToggle]}
            >
              <Text style={[styles.sceneToggleText, nightMode && styles.nightToggleText]}>
                {nightMode ? "☀ DAY" : "☾ NIGHT"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.brand}>
            <Goose size={5} walking={false} />
            <View style={{ gap: 0 }}>
              <Text style={[styles.wordmark, nightMode && styles.nightWordmark]}>GEESLING</Text>
              <Text style={[styles.submark, nightMode && styles.nightSubmark]}>WANDER, WITH GOOSEY GANDER</Text>
            </View>
          </View>

          <View style={styles.conversation} accessibilityLabel="Chat with Geesling">
            <View style={styles.gooseMessageRow}>
              <View style={styles.avatar}><Goose size={2.2} walking={false} /></View>
              <Panel style={styles.greeting} shadow={3}>
                <Text style={styles.honk}>HONK!</Text>
                <Text style={text.body}>
                  Need a few ideas on what to do today? Tell me what vibe you’re feeling and I shall waddle you around the city.
                </Text>
              </Panel>
            </View>

            <View style={styles.userMessageRow}>
              <View style={styles.composerBubble}>
                <TextInput
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder="What are you in the mood for?"
                  placeholderTextColor={colors.inkSoft}
                  style={styles.input}
                  multiline
                  maxLength={1200}
                  accessibilityLabel="Tell Geesling what you would like to do"
                  onSubmitEditing={submit}
                  onKeyPress={(event) => {
                    const native = event.nativeEvent as { key: string; shiftKey?: boolean };
                    if (Platform.OS === "web" && native.key === "Enter" && !native.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  submitBehavior="submit"
                  returnKeyType="send"
                />
              </View>
            </View>
            <View style={styles.sendRow}>
              <PixelButton label="Find my walk" tone="red" disabled={!prompt.trim()} onPress={submit} />
            </View>
          </View>

          <Pressable onPress={onSkip} accessibilityRole="link" style={styles.skip}>
            <Text style={[styles.skipText, nightMode && styles.nightSkipText]}>Skip to live map →</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment, overflow: "hidden" },
  nightScreen: { backgroundColor: "#202B49" },
  center: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 22, paddingVertical: 28 },
  content: { width: "100%", maxWidth: 560, gap: 20 },
  metaRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  clock: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.wood, letterSpacing: 0.3 },
  nightClock: { color: "#E8D6A7" },
  sceneToggle: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.paper },
  nightToggle: { backgroundColor: "#34435D", borderColor: "#D8C59A" },
  sceneToggleText: { fontFamily: fonts.heading, fontSize: 12, color: colors.ink },
  nightToggleText: { color: "#FFF8E6" },
  brand: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 },
  wordmark: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 40, color: colors.accent, letterSpacing: 1 },
  nightWordmark: { color: "#F0785D" },
  submark: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft, letterSpacing: 1.3 },
  nightSubmark: { color: "#E8D6A7" },
  conversation: { gap: 16 },
  gooseMessageRow: { alignSelf: "flex-start", flexDirection: "row", alignItems: "flex-end", gap: 9, width: "92%" },
  avatar: { width: 38, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink },
  greeting: { flex: 1, gap: 5, padding: 16, backgroundColor: colors.paper },
  userMessageRow: { width: "100%", alignItems: "flex-end" },
  composerBubble: { width: "82%", minHeight: 96, backgroundColor: colors.gold, borderWidth: 3, borderColor: colors.ink, borderRadius: 16, borderBottomRightRadius: 3, paddingHorizontal: 10, paddingVertical: 8 },
  honk: { fontFamily: fonts.heading, fontSize: 19, color: colors.accent },
  input: {
    minHeight: 76,
    maxHeight: 180,
    backgroundColor: "transparent",
    paddingHorizontal: 6,
    paddingVertical: 8,
    fontFamily: fonts.body,
    fontSize: 22,
    color: colors.ink,
    textAlignVertical: "top",
  },
  sendRow: { alignItems: "flex-end" },
  skip: { alignSelf: "center", paddingHorizontal: 14, paddingVertical: 8 },
  skipText: { color: colors.wood, fontFamily: fonts.heading, fontSize: 17, textDecorationLine: "underline" },
  nightSkipText: { color: "#F2C14E" },
});
