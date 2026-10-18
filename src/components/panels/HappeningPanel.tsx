import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Goose } from "@/components/Goose";
import { PixelButton, Tag } from "@/components/Pixel";
import { pinLabel, priceLabel, WINDOW_LABELS, whenLabel } from "@/lib/format";
import { CATEGORY_LABELS, colors, fonts, text } from "@/lib/theme";
import type { EventFilters, EventItem, TimeWindow } from "@/lib/types";

const BROWSE_CATEGORIES = ["music", "nightlife", "arts_culture", "gallery", "film", "food_drink", "market", "festival", "comedy", "outdoors"];

interface Props {
  events: EventItem[];
  loading: boolean;
  error: string | null;
  filters: EventFilters;
  onFilters: (filters: EventFilters) => void;
  onSelect: (event: EventItem) => void;
}

export function HappeningPanel({ events, loading, error, filters, onFilters, onSelect }: Props) {
  const toggleCategory = (c: string) =>
    onFilters({ ...filters, categories: filters.categories.includes(c) ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
        {(Object.keys(WINDOW_LABELS) as TimeWindow[]).map((w) => (
          <PixelButton key={w} label={WINDOW_LABELS[w]} small active={filters.window === w} onPress={() => onFilters({ ...filters, window: w })} />
        ))}
        <PixelButton label="Free only" icon="🟩" small tone={filters.freeOnly ? "green" : "paper"} onPress={() => onFilters({ ...filters, freeOnly: !filters.freeOnly })} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
        {BROWSE_CATEGORIES.map((c) => (
          <PixelButton
            key={c}
            label={CATEGORY_LABELS[c].label}
            icon={CATEGORY_LABELS[c].emoji}
            small
            active={filters.categories.includes(c)}
            onPress={() => toggleCategory(c)}
          />
        ))}
      </ScrollView>

      <View style={styles.legend}>
        <Tag label="Free" color={colors.free} />
        <Tag label="Paid" color={colors.paid} />
        <Text style={text.small}>🍻 drinks · 🎟️ RSVP ahead</Text>
        <Text style={[text.small, { marginLeft: "auto" }]}>{loading ? "Scouting…" : `${events.length} in view`}</Text>
      </View>

      {error ? <Text style={[text.small, styles.error]}>Couldn’t load events: {error}</Text> : null}

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ gap: 8, padding: 12, paddingTop: 4 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Goose size={4} />
            <Text style={text.body}>{loading ? "Goose is scouting the city…" : "Nothing here yet — try another time, zoom out, or ask Geesling."}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item)} accessibilityRole="button" style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: item.is_free ? colors.free : colors.paid }]}>
              <Text style={styles.swatchText}>{CATEGORY_LABELS[item.categories[0]]?.emoji ?? "⭐"}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
                {item.involves_alcohol ? " 🍻" : ""}
              </Text>
              <Text style={text.small} numberOfLines={1}>
                {whenLabel(item)}
              </Text>
              <Text style={text.small} numberOfLines={1}>
                {priceLabel(item)}
                {item.rsvp_required ? " · 🎟️ RSVP ahead" : ""}
                {item.venue_name ? ` · ${item.venue_name}` : ""}
              </Text>
            </View>
            <Tag label={pinLabel(item)} color={item.is_live ? colors.live : colors.gold} textColor={item.is_live ? colors.white : colors.ink} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: 6, alignItems: "center", paddingHorizontal: 12, paddingVertical: 6 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 4 },
  error: { color: colors.accent, paddingHorizontal: 12 },
  empty: { alignItems: "center", gap: 10, padding: 24 },
  row: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.paper, borderWidth: 3, borderColor: colors.ink, padding: 8 },
  swatch: { width: 36, height: 36, borderWidth: 2, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  swatchText: { fontSize: 16 },
  title: { fontFamily: fonts.heading, fontSize: 14, color: colors.ink },
});
