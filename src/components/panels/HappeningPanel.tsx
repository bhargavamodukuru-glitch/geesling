import { useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Goose } from "@/components/Goose";
import { PixelButton, Tag } from "@/components/Pixel";
import { pinLabel, priceLabel, torontoDay, WINDOW_LABELS, whenLabel } from "@/lib/format";
import { CATEGORY_LABELS, colors, fonts, text } from "@/lib/theme";
import type { EventFilters, EventItem, TimeWindow } from "@/lib/types";

const BROWSE_CATEGORIES = ["music", "nightlife", "arts_culture", "gallery", "film", "food_drink", "market", "festival", "comedy", "outdoors"];

function playHonk() {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return;
  const audio = new window.AudioContext();
  const oscillator = audio.createOscillator();
  const filter = audio.createBiquadFilter();
  const volume = audio.createGain();
  const now = audio.currentTime;
  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(390, now);
  oscillator.frequency.exponentialRampToValueAtTime(170, now + 0.22);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(850, now);
  volume.gain.setValueAtTime(0.001, now);
  volume.gain.exponentialRampToValueAtTime(0.16, now + 0.025);
  volume.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
  oscillator.connect(filter);
  filter.connect(volume);
  volume.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.28);
  window.setTimeout(() => void audio.close(), 400);
}

interface Props {
  events: EventItem[];
  loading: boolean;
  error: string | null;
  filters: EventFilters;
  onFilters: (filters: EventFilters) => void;
  onSelect: (event: EventItem) => void;
  onNearMe: () => void;
  locating: boolean;
  onRefresh: () => void;
}

export function HappeningPanel({ events, loading, error, filters, onFilters, onSelect, onNearMe, locating, onRefresh }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const [year, month] = torontoDay(new Date()).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  });
  const toggleCategory = (c: string) =>
    onFilters({ ...filters, categories: filters.categories.includes(c) ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] });
  const today = torontoDay(new Date());
  const monthKey = `${visibleMonth.getUTCFullYear()}-${String(visibleMonth.getUTCMonth() + 1).padStart(2, "0")}`;
  const firstWeekday = visibleMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const monthLabel = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", year: "numeric" }).format(visibleMonth);
  const selectedLabel = filters.date
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${filters.date}T12:00:00Z`))
    : "Choose date";
  const activeFilterCount = Number(filters.freeOnly || filters.paidOnly) + Number(filters.drinksOnly) + Number(filters.rsvpOnly) + filters.categories.length;
  const visibleDateLabel = filters.date
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${filters.date}T12:00:00Z`))
    : "Date";
  const honkAndLocate = () => {
    playHonk();
    onNearMe();
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ gap: 8, padding: 12, paddingTop: 4 }}
        ListHeaderComponent={
          <View>
            <View style={styles.toolbar}>
              <PixelButton
                label={activeFilterCount ? `Filters (${activeFilterCount})` : "Filters"}
                icon="☰"
                small
                active={filtersOpen}
                onPress={() => { setFiltersOpen((open) => !open); setCalendarOpen(false); }}
                accessibilityLabel={`Filters${activeFilterCount ? `, ${activeFilterCount} selected` : ""}`}
              />
              <PixelButton
                label={visibleDateLabel}
                icon="📅"
                small
                active={Boolean(filters.date) || calendarOpen}
                onPress={() => { setCalendarOpen((open) => !open); setFiltersOpen(false); }}
                accessibilityLabel={selectedLabel}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={locating ? "Finding events near you" : "Honk and find events near me"}
                accessibilityState={{ disabled: locating }}
                disabled={locating}
                onPress={honkAndLocate}
                style={({ pressed }) => [styles.nearMeButton, pressed && styles.pressed, locating && styles.locating]}
              >
                <Goose size={2} walking={false} />
                <Text style={styles.nearMeText}>{locating ? "Finding…" : "Near me"}</Text>
              </Pressable>
              <PixelButton label="↻" small onPress={onRefresh} accessibilityLabel="Refresh events" />
              <Text style={[text.small, styles.resultCount]}>{loading ? "Scouting…" : `${events.length} events`}</Text>
            </View>
            {calendarOpen ? (
              <View style={styles.calendar}>
                <View style={styles.monthHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              disabled={monthKey <= today.slice(0, 7)}
              onPress={() => setVisibleMonth(new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() - 1, 1)))}
              style={styles.monthArrow}
            ><Text style={[styles.monthArrowText, monthKey <= today.slice(0, 7) && styles.disabledText]}>‹</Text></Pressable>
            <Text style={styles.monthTitle}>{monthLabel}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setVisibleMonth(new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 1)))} style={styles.monthArrow}>
              <Text style={styles.monthArrowText}>›</Text>
            </Pressable>
                </View>
                <View style={styles.calendarGrid}>
            {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => <Text key={`${day}${i}`} style={styles.weekday}>{day}</Text>)}
            {Array.from({ length: firstWeekday }, (_, i) => <View key={`blank${i}`} style={styles.calendarDay} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const key = `${monthKey}-${String(day).padStart(2, "0")}`;
              const disabled = key < today;
              const selected = key === filters.date;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "full" }).format(new Date(`${key}T12:00:00Z`))}
                  accessibilityState={{ disabled, selected }}
                  disabled={disabled}
                  onPress={() => { onFilters({ ...filters, date: key }); setCalendarOpen(false); }}
                  style={[styles.calendarDay, disabled && styles.disabledDay, selected && styles.selectedDay, key === today && styles.todayDay]}
                ><Text style={[styles.dayText, disabled && styles.disabledText, selected && styles.selectedDayText]}>{day}</Text></Pressable>
              );
            })}
                </View>
                <Text style={styles.calendarHint}>Pick today or any future date in Toronto</Text>
              </View>
            ) : null}
            {filtersOpen ? (
              <View style={styles.filtersPanel}>
          <Text style={styles.sectionTitle}>When</Text>
          <View style={styles.optionRow}>
            {(Object.keys(WINDOW_LABELS) as TimeWindow[]).map((w) => (
              <PixelButton key={w} label={WINDOW_LABELS[w]} small active={!filters.date && filters.window === w} onPress={() => onFilters({ ...filters, window: w, date: null })} />
            ))}
          </View>
          <Text style={styles.sectionTitle}>Categories</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryOptions}>
            {BROWSE_CATEGORIES.map((c) => (
              <PixelButton key={c} label={CATEGORY_LABELS[c].label} icon={CATEGORY_LABELS[c].emoji} small active={filters.categories.includes(c)} onPress={() => toggleCategory(c)} />
            ))}
          </ScrollView>
          <Text style={styles.sectionTitle}>More filters</Text>
          <View style={styles.optionRow}>
            <PixelButton label="Free" icon="🟩" small tone="green" active={filters.freeOnly} onPress={() => onFilters({ ...filters, freeOnly: !filters.freeOnly, paidOnly: false })} />
            <PixelButton label="Paid" icon="🟪" small tone="purple" active={filters.paidOnly} onPress={() => onFilters({ ...filters, paidOnly: !filters.paidOnly, freeOnly: false })} />
            <PixelButton label="Drinks" icon="🍻" small active={filters.drinksOnly} onPress={() => onFilters({ ...filters, drinksOnly: !filters.drinksOnly })} />
            <PixelButton label="RSVP ahead" icon="🎟️" small active={filters.rsvpOnly} onPress={() => onFilters({ ...filters, rsvpOnly: !filters.rsvpOnly })} />
          </View>
              </View>
            ) : null}

            {error ? <Text style={[text.small, styles.error]}>Couldn’t load events: {error}</Text> : null}
          </View>
        }
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
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  resultCount: { marginLeft: "auto" },
  nearMeButton: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink },
  nearMeText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 18, color: colors.ink },
  pressed: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  locating: { opacity: 0.55 },
  filtersPanel: { marginHorizontal: 12, marginBottom: 6, padding: 10, gap: 4, backgroundColor: colors.parchment, borderWidth: 2, borderColor: colors.ink },
  sectionTitle: { fontFamily: fonts.headingRegular, fontSize: 17, color: colors.ink, marginTop: 3 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", paddingVertical: 4 },
  categoryOptions: { flexDirection: "row", gap: 6, alignItems: "center", paddingVertical: 4 },
  calendar: { marginHorizontal: 12, marginBottom: 6, padding: 10, backgroundColor: colors.paper, borderWidth: 3, borderColor: colors.ink },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  monthArrow: { width: 36, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: colors.gold, borderWidth: 2, borderColor: colors.ink },
  monthArrowText: { fontFamily: fonts.heading, fontSize: 24, color: colors.ink, lineHeight: 28 },
  monthTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: "14.2857%", textAlign: "center", color: colors.ink, fontFamily: fonts.heading, paddingVertical: 4 },
  calendarDay: { width: "14.2857%", aspectRatio: 1.25, alignItems: "center", justifyContent: "center" },
  dayText: { fontFamily: fonts.heading, fontSize: 15, color: colors.ink },
  disabledDay: { opacity: 0.35 },
  disabledText: { color: colors.inkSoft },
  selectedDay: { backgroundColor: colors.free, borderWidth: 2, borderColor: colors.ink },
  selectedDayText: { color: colors.white },
  todayDay: { borderWidth: 2, borderColor: colors.gold },
  calendarHint: { ...text.small, textAlign: "center", paddingTop: 4 },
  error: { color: colors.accent, paddingHorizontal: 12 },
  empty: { alignItems: "center", gap: 10, padding: 24 },
  row: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.paper, borderWidth: 3, borderColor: colors.ink, padding: 8 },
  swatch: { width: 36, height: 36, borderWidth: 2, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  swatchText: { fontSize: 16 },
  title: { fontFamily: fonts.body, fontSize: 20, lineHeight: 21, color: colors.ink },
});
