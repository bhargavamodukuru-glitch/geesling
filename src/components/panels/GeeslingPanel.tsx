import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Linking from "expo-linking";
import { FlatList, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Goose } from "@/components/Goose";
import { PlannerFlow } from "@/components/PlannerFlow";
import { GeeslingLoader } from "@/components/GeeslingLoader";
import { Panel, PixelButton } from "@/components/Pixel";
import { WalkCard } from "@/components/WalkCard";
import { askGeesling } from "@/lib/api";
import { OUT_OF_AREA_MESSAGE, mentionsOtherPlace } from "@/lib/area";
import { MAX_RETRIES, buildRetryRequest, type LatLng, type PlanRequest } from "@/lib/planner";
import { colors, fonts, text } from "@/lib/theme";
import { itemTitle, type ChatMessage, type MapItem, type Walk } from "@/lib/types";

const VIBES: { label: string; icon: string; prompt: string }[] = [
  { label: "Step outside your comfort zone", icon: "🔥", prompt: "I'm looking to step out of my comfort zone. Where in Toronto is best to do this right now?" },
  { label: "Low-key chill", icon: "🌙", prompt: "Plan me a low-key, chill few hours — cozy spots, nothing too loud." },
  { label: "Meet people", icon: "🤝", prompt: "I want to meet new people. Find social events and spots where it's easy to start talking to strangers." },
  { label: "Artsy & weird", icon: "🎨", prompt: "Show me the artsy and weird side of Toronto — galleries, odd shows, indie stuff." },
  { label: "Cheap eats + thrift", icon: "🛍️", prompt: "Find me 5 unique, low cost activities happening in Toronto where I can try new food, have a sweet treat and maybe go thrifting." },
  { label: "Free stuff", icon: "🆓", prompt: "Only free things: what can I do around Toronto today without spending a cent?" },
  { label: "Live music tonight", icon: "🎸", prompt: "Where can I catch live music tonight, plus a good spot to eat nearby first?" },
  { label: "Night out", icon: "🪩", prompt: "Plan a fun night out: dinner, a show or club night, and somewhere for a late snack." },
  { label: "First time in Toronto", icon: "🧳", prompt: "I'm a tourist here for one day. Give me a walk that shows the real Toronto, not just the CN Tower." },
];

const BUDGETS: { label: string; minutes: number | null }[] = [
  { label: "Any time", minutes: null },
  { label: "1 hr", minutes: 60 },
  { label: "2 hrs", minutes: 120 },
  { label: "4 hrs", minutes: 240 },
  { label: "All day", minutes: 600 },
];

interface Props {
  origin: { lat: number; lng: number } | null;
  onLocate: () => Promise<LatLng | null>;
  freeOnly: boolean;
  initialRequest: PlanRequest | null;
  onPromptConsumed: () => void;
  onInitialPromptComplete: () => void;
  onWalk: (walk: Walk) => void;
  onSelectStop: (item: MapItem, why: string) => void;
}

let counter = 0;
const nextId = () => `m${Date.now()}-${counter++}`;

export function GeeslingPanel({ origin, onLocate, freeOnly, initialRequest, onPromptConsumed, onInitialPromptComplete, onWalk, onSelectStop }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [budget, setBudget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  // What the latest walk answers: the original request, every name shown so far, and how many retries were used.
  const [plan, setPlan] = useState<{ request: PlanRequest; shown: string[]; retries: number } | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const lastInitialRequest = useRef<PlanRequest | null>(null);

  // `request` carries the guided planner's choices; fields it leaves undefined fall back to this panel's own state.
  // `kind: "retry"` is "Try another": same request, asking for something different.
  const send = useCallback(async (prompt: string, initial = false, request?: PlanRequest, kind: "new" | "retry" = "new") => {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    const userMessage: ChatMessage = { id: nextId(), role: "user", text: trimmed, display: request?.display };
    const musicCrawlerLink = /\b(music|concerts?|gigs?|bands?|live performances?|live shows?)\b/i.test(trimmed);
    const history = messages;
    setMessages((m) => [...m, userMessage]);
    setDraft("");
    // A retry's prompt lists venue names ("Paris Texas Bar"), so only fresh requests are checked.
    if (kind === "new" && mentionsOtherPlace(trimmed)) {
      setMessages((m) => [...m, { id: nextId(), role: "assistant", text: OUT_OF_AREA_MESSAGE }]);
      if (initial) onInitialPromptComplete();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }
    setBusy(true);
    try {
      const reply = await askGeesling({
        prompt: trimmed,
        history,
        origin: request?.origin !== undefined ? request.origin : origin,
        timeBudgetMinutes: request?.timeBudgetMinutes !== undefined ? request.timeBudgetMinutes : budget,
        startAt: null,
        freeOnly: request?.freeOnly ?? freeOnly,
        travel: request?.travel,
        budgetLimit: request?.budgetLimit,
        partySize: request?.partySize,
      });
      setMessages((m) => [...m, { id: nextId(), role: "assistant", text: reply.message, walk: reply.walk, musicCrawlerLink }]);
      if (reply.walk) {
        const names = reply.walk.stops.map((s) => itemTitle(s.item));
        setPlan((prev) =>
          kind === "retry" && prev
            ? { ...prev, shown: [...prev.shown, ...names], retries: prev.retries + 1 }
            : { request: request ?? { prompt: trimmed }, shown: names, retries: 0 },
        );
        onWalk(reply.walk);
      }
    } catch (e) {
      setMessages((m) => [...m, { id: nextId(), role: "assistant", text: `Honk… something went wrong: ${(e as Error).message}`, error: true }]);
    } finally {
      setBusy(false);
      if (initial) onInitialPromptComplete();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [busy, messages, origin, budget, freeOnly, onWalk, onInitialPromptComplete]);

  const lastWalkId = useMemo(() => [...messages].reverse().find((m) => m.walk)?.id ?? null, [messages]);
  const retriesLeft = plan ? MAX_RETRIES - plan.retries : 0;
  const tryAnother = () => {
    if (!plan || busy || retriesLeft <= 0) return;
    const retry = buildRetryRequest(plan.request, plan.shown);
    void send(retry.prompt, false, retry, "retry");
  };

  useEffect(() => {
    if (!initialRequest) {
      lastInitialRequest.current = null;
      return;
    }
    if (lastInitialRequest.current === initialRequest) return;
    lastInitialRequest.current = initialRequest;
    onPromptConsumed();
    if (initialRequest.timeBudgetMinutes !== undefined) setBudget(initialRequest.timeBudgetMinutes);
    void send(initialRequest.prompt, true, initialRequest);
  }, [initialRequest, onPromptConsumed, send]);

  if (adjusting) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        <PlannerFlow
          initialVibe={null}
          initialPrefs={plan?.request.prefs}
          userLocation={origin}
          onLocate={onLocate}
          onCancel={() => setAdjusting(false)}
          onSubmit={(request) => {
            setAdjusting(false);
            void send(request.prompt, false, request, "new");
          }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={messages}
        // Rows read `busy` and the retry count, so tell the list to re-render when they change.
        extraData={`${busy}-${retriesLeft}-${lastWalkId}`}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ gap: 10, padding: 12 }}
        ListHeaderComponent={messages.length === 0 ? (
          <View style={{ gap: 10 }}>
            <View style={styles.hello}>
              <Goose size={3} />
              <Panel style={styles.bubble} shadow={3}>
                <Text style={styles.speaker}>GEESLING</Text>
                <Text style={text.body}>
                  Honk! Tell me your vibe and how much time you’ve got. I’ll waddle you around the city — real events happening now, plus spots that are always open.
                </Text>
              </Panel>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
              {VIBES.map((v) => (
                <PixelButton key={v.label} label={v.label} icon={v.icon} small disabled={busy} onPress={() => void send(v.prompt)} />
              ))}
            </ScrollView>
          </View>
        ) : <View />}
        renderItem={({ item }) =>
          item.role === "user" ? (
            <View style={styles.userBubble}>
              <Text style={[text.body, { color: colors.white }]}>{item.display ?? item.text}</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Panel style={[styles.bubble, item.error && { borderColor: colors.accent }]} shadow={3}>
                <Text style={styles.speaker}>GEESLING</Text>
                <Text style={text.body}>{item.text}</Text>
              </Panel>
              {item.walk ? <WalkCard walk={item.walk} onShowOnMap={onWalk} onSelectStop={onSelectStop} /> : null}
              {item.id === lastWalkId && !busy ? (
                <View style={styles.resultActions}>
                  {retriesLeft > 0 ? (
                    <PixelButton label="Try another" icon="🎲" tone="gold" onPress={tryAnother} />
                  ) : (
                    <Text style={[text.small, { flex: 1 }]}>Want something different? Adjust your choices.</Text>
                  )}
                  <PixelButton label="Adjust" icon="🎚️" onPress={() => setAdjusting(true)} />
                </View>
              ) : null}
              {item.musicCrawlerLink ? (
                <PixelButton
                  label="Browse live music on MusicCrawler"
                  icon="🎸"
                  small
                  onPress={() => void Linking.openURL("https://musiccrawler.live/calendar/")}
                />
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          busy ? <View style={styles.thinking}><GeeslingLoader label="Waddling around the city…" /></View> : undefined
        }
      />

      <View style={styles.composer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
          <Text style={[text.label, { alignSelf: "center" }]}>⏳ Time:</Text>
          {BUDGETS.map((b) => (
            <PixelButton key={b.label} label={b.label} small active={budget === b.minutes} onPress={() => setBudget(b.minutes)} />
          ))}
          {freeOnly ? <Text style={[text.small, { alignSelf: "center", color: colors.freeDark }]}>🟩 Free-only on</Text> : null}
        </ScrollView>
        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="e.g. cheap dumplings, a dessert spot and a gallery opening"
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
            multiline
            maxLength={1200}
            onSubmitEditing={() => void send(draft)}
            onKeyPress={(e) => {
              // Web textareas insert a newline on Enter; send instead (Shift+Enter keeps the newline).
              const native = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (Platform.OS === "web" && native.key === "Enter" && !native.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            submitBehavior="submit"
            returnKeyType="send"
            editable={!busy}
          />
          <PixelButton label="Ask" tone="red" disabled={busy || !draft.trim()} onPress={() => void send(draft)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hello: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  bubble: { flexShrink: 1, gap: 2, padding: 10 },
  speaker: { fontFamily: fonts.heading, fontSize: 11, color: colors.accent },
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: 6, alignItems: "center", paddingVertical: 4 },
  resultActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  userBubble: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: colors.wood, borderWidth: 3, borderColor: colors.ink, padding: 10 },
  thinking: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8 },
  composer: { borderTopWidth: 3, borderColor: colors.ink, backgroundColor: colors.parchment, paddingHorizontal: 12, paddingBottom: 10, gap: 4 },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: colors.paper,
    borderWidth: 3,
    borderColor: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: fonts.body,
    fontSize: 20,
    color: colors.ink,
  },
});
