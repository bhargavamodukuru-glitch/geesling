import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Goose } from "@/components/Goose";
import { PixelButton } from "@/components/Pixel";
import { WalkCard } from "@/components/WalkCard";
import { useSaved } from "@/hooks/useSaved";
import { priceLabel, whenLabel } from "@/lib/format";
import { colors, fonts, text } from "@/lib/theme";
import { itemTitle, type MapItem, type SavedItem, type Walk } from "@/lib/types";

interface Props {
  onSelect: (item: MapItem) => void;
  onShowWalk: (walk: Walk) => void;
}

function isPast(entry: SavedItem): boolean {
  if (entry.kind !== "event") return false;
  return new Date((entry.snapshot as Extract<MapItem, { kind: "event" }>).next_end).getTime() < Date.now();
}

export function SavedPanel({ onSelect, onShowWalk }: Props) {
  const { saved, loading, error, toggle, refresh } = useSaved();
  const live = saved.filter((s) => !isPast(s));

  return (
    <FlatList
      data={live}
      keyExtractor={(s) => `${s.kind}-${s.item_id}`}
      contentContainerStyle={{ gap: 10, padding: 12 }}
      refreshing={loading}
      onRefresh={() => void refresh()}
      ListHeaderComponent={error ? <Text style={[text.small, { color: colors.accent }]}>{error}</Text> : undefined}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Goose size={4} walking={false} />
          <Text style={text.body}>No saved spots yet. Tap ☆ on any pin or walk to keep it here.</Text>
        </View>
      }
      renderItem={({ item: entry }) => {
        if (entry.kind === "walk") return <WalkCard walk={entry.snapshot as Walk} onShowOnMap={onShowWalk} onSelectStop={(i) => onSelect(i)} />;
        const item = entry.snapshot as MapItem;
        return (
          <View style={styles.row}>
            <Pressable style={{ flex: 1, gap: 2 }} onPress={() => onSelect(item)} accessibilityRole="button">
              <Text style={styles.title} numberOfLines={2}>
                {item.is_free ? "🟩" : "🟪"} {itemTitle(item)}
                {item.involves_alcohol ? " 🍻" : ""}
              </Text>
              <Text style={text.small}>
                {item.kind === "event" ? whenLabel(item) : (item.address ?? "")} · {priceLabel(item)}
              </Text>
            </Pressable>
            <PixelButton label="★" small active onPress={() => void toggle(entry.kind, entry.item_id, item)} accessibilityLabel="Remove from saved" />
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", gap: 10, padding: 24 },
  row: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.paper, borderWidth: 3, borderColor: colors.ink, padding: 8 },
  title: { fontFamily: fonts.heading, fontSize: 14, color: colors.ink },
});
