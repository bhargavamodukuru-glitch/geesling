import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Goose } from "@/components/Goose";
import { Header } from "@/components/Header";
import { ItemSheet } from "@/components/ItemSheet";
import { CityMap } from "@/components/map/CityMap";
import { Panel, PixelButton } from "@/components/Pixel";
import { SetupNotice } from "@/components/SetupNotice";
import { WalkCard } from "@/components/WalkCard";
import { fetchWalk } from "@/lib/api";
import { isConfigured } from "@/lib/supabase";
import { colors, text } from "@/lib/theme";
import type { MapItem, Walk } from "@/lib/types";

export default function SharedWalkScreen() {
  if (!isConfigured) return <SetupNotice />;
  return <SharedWalk />;
}

function SharedWalk() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [walk, setWalk] = useState<Walk | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [selected, setSelected] = useState<{ item: MapItem; note: string | null } | null>(null);
  const [focusKey, setFocusKey] = useState(0);

  useEffect(() => {
    if (!id) return;
    fetchWalk(id)
      .then((w) => {
        setWalk(w);
        setState(w ? "ready" : "missing");
        if (w) setTimeout(() => setFocusKey((k) => k + 1), 300);
      })
      .catch(() => setState("error"));
  }, [id]);

  if (state !== "ready" || !walk) {
    return (
      <SafeAreaView style={styles.screen}>
        <Header />
        <View style={styles.center}>
          <Panel style={{ alignItems: "center", gap: 10, maxWidth: 380 }}>
            <Goose size={4} walking={state === "loading"} />
            <Text style={text.body}>
              {state === "loading" ? "Fetching the walk…" : state === "missing" ? "Honk? That walk flew away." : "Couldn't load this walk. Check your connection."}
            </Text>
            <PixelButton label="Plan my own walk" icon="🪿" tone="gold" onPress={() => router.replace("/")} />
          </Panel>
        </View>
      </SafeAreaView>
    );
  }

  const wide = width >= 900;
  return (
    <SafeAreaView style={styles.screen}>
      <Header />
      <View style={{ flex: 1, flexDirection: wide ? "row" : "column" }}>
        <View style={{ flex: 1, backgroundColor: colors.grass }}>
          <CityMap
            items={[]}
            walk={walk}
            selectedId={selected?.item.id ?? null}
            userLocation={null}
            focusKey={focusKey}
            onSelect={(item) => setSelected(item ? { item, note: walk.stops.find((s) => s.item.id === item.id)?.why ?? null } : null)}
            onBoundsChange={() => undefined}
          />
          {selected ? (
            <View style={styles.sheetWrap}>
              <ItemSheet item={selected.item} note={selected.note} onClose={() => setSelected(null)} />
            </View>
          ) : null}
        </View>
        <ScrollView style={wide ? { width: 460, flexGrow: 0, flexShrink: 0, flexBasis: 460 } : { flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
          <Panel style={{ gap: 4 }}>
            <Text style={text.label}>Someone asked Geesling:</Text>
            <Text style={text.body}>“{walk.prompt}”</Text>
          </Panel>
          <Panel>
            <Text style={text.body}>{walk.intro}</Text>
          </Panel>
          <WalkCard walk={walk} onSelectStop={(item, why) => setSelected({ item, note: why })} />
          <PixelButton label="Plan my own walk" icon="🪿" tone="red" onPress={() => router.replace("/")} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  sheetWrap: { position: "absolute", left: 10, right: 10, bottom: 10 },
});
