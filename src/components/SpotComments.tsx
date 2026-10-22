import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { PixelButton } from "@/components/Pixel";
import { deleteComment, fetchComments, postComment, reportComment, type SpotComment } from "@/lib/api";
import { colors, fonts, text } from "@/lib/theme";
import type { MapItem } from "@/lib/types";

const NICKNAME_KEY = "geesling.nickname";

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

/** Public comments on one spot: read them, post under a nickname, report, or delete your own. */
export function SpotComments({ item }: { item: MapItem }) {
  const [comments, setComments] = useState<SpotComment[] | null>(null);
  const [nickname, setNickname] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    fetchComments(item.kind, item.id)
      .then(setComments)
      .catch((e: Error) => setError(e.message));
  }, [item.kind, item.id]);

  // ItemSheet gives each spot its own key, so state starts fresh per spot.
  useEffect(() => {
    load();
  }, [load]);

  // The nickname is remembered on this device; a goose number until they pick one.
  useEffect(() => {
    void AsyncStorage.getItem(NICKNAME_KEY).then((saved) => setNickname(saved ?? `Goose ${Math.floor(100 + Math.random() * 900)}`));
  }, []);

  const post = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await postComment(item.kind, item.id, nickname, body);
      void AsyncStorage.setItem(NICKNAME_KEY, nickname.trim());
      setBody("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const report = async (id: number) => {
    setReported((r) => new Set(r).add(id));
    try {
      await reportComment(id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteComment(id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <View style={styles.wrap} accessibilityLabel="Comments">
      <Text style={styles.heading}>COMMENTS{comments?.length ? ` (${comments.length})` : ""}</Text>
      {comments === null ? <Text style={text.small}>Loading comments…</Text> : null}
      {comments?.length === 0 ? <Text style={text.small}>No comments yet. Been here? Tell people what it’s like.</Text> : null}
      {comments?.map((c) => (
        <View key={c.id} style={styles.comment}>
          <Text style={styles.meta}>
            {c.nickname} · {timeAgo(c.created_at)}
          </Text>
          <Text style={text.body}>{c.body}</Text>
          <View style={styles.actions}>
            {c.mine ? (
              <Pressable onPress={() => void remove(c.id)} accessibilityRole="button" accessibilityLabel="Delete your comment">
                <Text style={styles.action}>Delete</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => void report(c.id)} disabled={reported.has(c.id)} accessibilityRole="button" accessibilityLabel={`Report comment by ${c.nickname}`}>
                <Text style={styles.action}>{reported.has(c.id) ? "Reported, thanks" : "Report"}</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}

      <View style={styles.composer}>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          maxLength={30}
          placeholder="Nickname"
          placeholderTextColor={colors.inkSoft}
          style={[styles.input, styles.nickname]}
          accessibilityLabel="Your nickname"
        />
        <TextInput
          value={body}
          onChangeText={setBody}
          maxLength={500}
          multiline
          placeholder="Share a tip about this spot (no links)"
          placeholderTextColor={colors.inkSoft}
          style={[styles.input, styles.body]}
          accessibilityLabel="Your comment"
        />
        {error ? <Text style={[text.small, styles.error]}>{error}</Text> : null}
        <PixelButton label={busy ? "Posting…" : "Post comment"} small tone="gold" disabled={!body.trim() || !nickname.trim() || busy} onPress={() => void post()} style={styles.post} />
        <Text style={styles.fine}>Comments are public. Be kind; reported comments are hidden.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 6, borderTopWidth: 2, borderColor: colors.ink, paddingTop: 8 },
  heading: { fontFamily: fonts.heading, fontSize: 12, color: colors.inkSoft },
  comment: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink, padding: 6, gap: 2 },
  meta: { fontFamily: fonts.heading, fontSize: 11, color: colors.wood },
  actions: { flexDirection: "row", justifyContent: "flex-end" },
  action: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft, textDecorationLine: "underline" },
  composer: { gap: 6, marginTop: 4 },
  input: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 8, paddingVertical: 6, fontFamily: fonts.body, fontSize: 17, color: colors.ink },
  nickname: { width: "60%" },
  body: { minHeight: 64, textAlignVertical: "top" },
  error: { color: colors.accent },
  post: { alignSelf: "flex-start" },
  fine: { ...text.small, color: colors.inkSoft },
});
