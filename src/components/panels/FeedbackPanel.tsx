import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Goose } from "@/components/Goose";
import { Panel, PixelButton } from "@/components/Pixel";
import { sendFeedback, type FeedbackRating } from "@/lib/api";
import { colors, fonts, text } from "@/lib/theme";

const RATINGS: { value: FeedbackRating; icon: string; label: string }[] = [
  { value: 3, icon: "😍", label: "Love it" },
  { value: 2, icon: "🙂", label: "It's okay" },
  { value: 1, icon: "😕", label: "Not great" },
];

/** Beta feedback: an optional rating, a message and an optional way to reply. Goes to the team's Google Sheet. */
export function FeedbackPanel() {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendFeedback({ rating, message, contact: contact || null, platform: Platform.OS });
      setSent(true);
      setRating(null);
      setMessage("");
      setContact("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Goose size={3} walking={false} />
        <Panel style={styles.bubble} shadow={3}>
          <Text style={styles.honk}>HONK! I’M IN BETA</Text>
          <Text style={text.body}>Tell me what worked, what broke, and what you wish I could do. Every note gets read.</Text>
        </Panel>
      </View>

      {sent ? (
        <Panel tone="parchment" style={styles.card}>
          <Text style={[text.body, styles.center]}>Thank you! Your feedback is on its way. Honk honk 🪿</Text>
          <PixelButton label="Send more feedback" small onPress={() => setSent(false)} style={styles.centerSelf} />
        </Panel>
      ) : (
        <Panel tone="parchment" style={styles.card}>
          <Text style={styles.label}>HOW’S GEESLING SO FAR? (OPTIONAL)</Text>
          <View style={styles.ratings}>
            {RATINGS.map((r) => (
              <PixelButton
                key={r.value}
                label={r.label}
                icon={r.icon}
                small
                active={rating === r.value}
                onPress={() => setRating(rating === r.value ? null : r.value)}
              />
            ))}
          </View>

          <Text style={styles.label}>YOUR FEEDBACK</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="e.g. the walk took me somewhere closed, or I'd love brunch spots…"
            placeholderTextColor={colors.inkSoft}
            multiline
            maxLength={2000}
            style={[styles.input, styles.message]}
            accessibilityLabel="Your feedback"
          />

          <Text style={styles.label}>EMAIL OR @HANDLE, IF YOU’D LIKE A REPLY (OPTIONAL)</Text>
          <TextInput
            value={contact}
            onChangeText={setContact}
            placeholder="you@example.com"
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
            style={styles.input}
            accessibilityLabel="Email or handle for a reply, optional"
          />

          {error ? <Text style={[text.small, styles.error]}>{error}</Text> : null}
          <PixelButton label={sending ? "Sending…" : "Send feedback"} tone="red" disabled={!message.trim() || sending} onPress={() => void submit()} style={styles.centerSelf} />
        </Panel>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 12, gap: 12 },
  intro: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  bubble: { flex: 1, gap: 4, padding: 12, backgroundColor: colors.paper },
  honk: { fontFamily: fonts.heading, fontSize: 14, color: colors.accent },
  card: { gap: 8 },
  label: { fontFamily: fonts.heading, fontSize: 11, color: colors.inkSoft, marginTop: 4 },
  ratings: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 10, paddingVertical: 8, fontFamily: fonts.body, fontSize: 18, color: colors.ink },
  message: { minHeight: 110, textAlignVertical: "top" },
  error: { color: colors.accent },
  center: { textAlign: "center" },
  centerSelf: { alignSelf: "center", marginTop: 4 },
});
