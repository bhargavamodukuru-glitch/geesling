import * as Linking from "expo-linking";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Panel, PixelButton, Tag } from "@/components/Pixel";
import { useSaved } from "@/hooks/useSaved";
import { placeType, priceLabel, whenLabel } from "@/lib/format";
import { openDirections } from "@/lib/links";
import { descriptionWithoutLinks, socialLinksForItem } from "@/lib/socialLinks";
import { CATEGORY_LABELS, colors, fonts, text } from "@/lib/theme";
import type { MapItem } from "@/lib/types";

const SOURCE_NAMES: Record<string, string> = {
  toronto: "City of Toronto",
  ticketmaster: "Ticketmaster",
  eventbrite: "Eventbrite",
};

interface Props {
  item: MapItem;
  note?: string | null; // Geesling's "why" when the item is part of a walk
  onClose: () => void;
  maxHeight?: number; // space available above the bottom of the map
}

export function ItemSheet({ item, note, onClose, maxHeight }: Props) {
  const { isSaved, toggle } = useSaved();
  const saved = isSaved(item.kind, item.id);
  const free = item.is_free;
  const isPhotoSpot = item.kind === "place" && item.types.includes("photography_spot");
  const title = item.kind === "event" ? item.title : item.name;
  const link = item.kind === "event" ? (item.ticket_url ?? item.url) : item.website;
  const socialLinks = socialLinksForItem(item);
  const description = descriptionWithoutLinks(item);

  return (
    <Panel style={[styles.sheet, maxHeight !== undefined && { maxHeight: Math.max(160, maxHeight) }]} shadow={5}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.tags}>
            <Tag label={priceLabel(item)} color={free ? colors.free : colors.paid} />
            {item.kind === "event" && item.is_live ? <Tag label="LIVE NOW" color={colors.live} /> : null}
            {item.involves_alcohol ? <Tag label="🍻 Drinks" color={colors.gold} textColor={colors.ink} /> : null}
            {isPhotoSpot ? <Tag label="📸 Photo spot" color={colors.photoPin} /> : null}
            {item.kind === "event" && item.age_min ? <Tag label={`${item.age_min}+`} color={colors.ink} /> : null}
          </View>
          <Text style={text.h2} numberOfLines={3}>
            {title}
          </Text>
        </View>
        <PixelButton label="✕" small onPress={onClose} accessibilityLabel="Close details" />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ gap: 8 }}>
        {item.kind === "event" && item.image_url && (maxHeight === undefined || maxHeight > 420) ? <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" /> : null}

        {note ? (
          <View style={styles.note}>
            <Text style={styles.noteLabel}>GEESLING SAYS</Text>
            <Text style={text.body}>{note}</Text>
          </View>
        ) : null}

        {item.kind === "event" ? (
          <>
            {item.rsvp_required ? (
              <View style={styles.rsvp}>
                <Text style={styles.rsvpTitle}>🎟️ RSVP / tickets needed ahead of time</Text>
                {item.rsvp_note ? <Text style={text.small}>{item.rsvp_note}</Text> : null}
              </View>
            ) : (
              <Text style={text.small}>✅ No RSVP needed — just show up.</Text>
            )}
            <Text style={text.body}>🕒 {whenLabel(item)}</Text>
            {item.schedule_summary ? <Text style={text.small}>📅 {item.schedule_summary}</Text> : null}
            {item.venue_name || item.address ? (
              <Text style={text.small}>📍 {[item.venue_name, item.address].filter(Boolean).join(" · ")}</Text>
            ) : null}
            {item.price_note && !item.is_free ? <Text style={text.small}>💸 {item.price_note}</Text> : null}
            <View style={styles.tags}>
              {item.categories.map((c) => (
                <Tag key={c} label={`${CATEGORY_LABELS[c]?.emoji ?? ""} ${CATEGORY_LABELS[c]?.label ?? c}`} color={colors.parchmentDark} textColor={colors.ink} />
              ))}
            </View>
            {description ? (
              <Text style={text.small} numberOfLines={8}>
                {description}
              </Text>
            ) : null}
            <Text style={styles.source}>Listed by {SOURCE_NAMES[item.source] ?? item.source}</Text>
          </>
        ) : (
          <>
            <Text style={text.body}>
              {placeType(item)}
              {item.rating ? ` · ⭐ ${item.rating} (${item.rating_count ?? 0} Google reviews)` : ""}
            </Text>
            {item.open_now !== null ? <Text style={text.small}>{item.open_now ? "🟢 Open now" : "🔴 Closed right now"}</Text> : null}
            {item.address ? <Text style={text.small}>📍 {item.address}</Text> : null}
            {item.summary ? <Text style={text.small}>{item.summary}</Text> : null}
            {item.hours ? <Text style={text.small}>{item.hours.join("\n")}</Text> : null}
            <Text style={styles.source}>{isPhotoSpot ? "Curated scenic viewpoint · Check map for current access" : "Place info from Google"}</Text>
          </>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <PixelButton label="Walk there" icon="🪿" tone="gold" small onPress={() => openDirections(item)} />
        <PixelButton label="TTC" icon="🚋" small onPress={() => openDirections(item, true)} />
        {item.kind === "place" && item.maps_url ? (
          <PixelButton label="Google Maps & reviews" small onPress={() => void Linking.openURL(item.maps_url!)} />
        ) : null}
        {link ? (
          <PixelButton
            label={item.kind === "event" && item.rsvp_required ? "RSVP / Tickets" : "Website"}
            tone={item.kind === "event" && item.rsvp_required ? "red" : "paper"}
            small
            onPress={() => void Linking.openURL(link)}
          />
        ) : null}
        {socialLinks.map((social) => (
          <Pressable
            key={social.url}
            accessibilityRole="button"
            accessibilityLabel={`Open ${social.label}`}
            onPress={() => void Linking.openURL(social.url)}
            style={({ pressed }) => [styles.socialButton, pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}
          >
            {social.platform === "instagram" ? (
              <View style={styles.instagramLogo}>
                <View style={styles.instagramLens} />
                <View style={styles.instagramDot} />
              </View>
            ) : social.platform === "linktree" ? (
              <Text style={styles.socialMark}>🌳</Text>
            ) : social.platform === "beacons" ? (
              <Text style={[styles.socialMark, styles.beaconsMark]}>✦</Text>
            ) : (
              <Text style={[styles.socialMark, social.platform === "facebook" && styles.facebookMark, social.platform === "youtube" && styles.youtubeMark]}>
                {social.platform === "facebook" ? "f" : social.platform === "tiktok" ? "♪" : social.platform === "youtube" ? "▶" : social.platform === "threads" ? "@" : social.platform === "x" ? "𝕏" : "↗"}
              </Text>
            )}
          </Pressable>
        ))}
        <PixelButton label={saved ? "Saved" : "Save"} icon={saved ? "★" : "☆"} small active={saved} onPress={() => void toggle(item.kind, item.id, item)} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: 460, gap: 8 },
  header: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  body: { flexGrow: 0, flexShrink: 1 },
  image: { width: "100%", height: 140, borderWidth: 2, borderColor: colors.ink },
  note: { backgroundColor: colors.parchment, borderWidth: 2, borderColor: colors.wood, padding: 8 },
  noteLabel: { fontFamily: fonts.heading, fontSize: 11, color: colors.accent },
  rsvp: { backgroundColor: "#FBE3DF", borderWidth: 2, borderColor: colors.accent, padding: 8, gap: 2 },
  rsvpTitle: { fontFamily: fonts.heading, fontSize: 13, color: colors.accent },
  source: { fontFamily: fonts.body, fontSize: 16, color: colors.inkSoft },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  socialButton: {
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  instagramLogo: { width: 23, height: 23, borderRadius: 7, borderWidth: 2.5, borderColor: "#C13584", alignItems: "center", justifyContent: "center" },
  instagramLens: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: "#C13584" },
  instagramDot: { position: "absolute", width: 3, height: 3, borderRadius: 2, backgroundColor: "#C13584", top: 3, right: 3 },
  socialMark: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 25, color: colors.ink },
  facebookMark: { color: "#1877F2", fontSize: 27 },
  youtubeMark: { color: "#FF0000", fontSize: 19 },
  beaconsMark: { color: "#5B5FEF", fontSize: 26 },
});
