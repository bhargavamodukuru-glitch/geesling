import { Platform, type TextStyle, type ViewStyle } from "react-native";

export const colors = {
  parchment: "#F6E7C1",
  parchmentDark: "#EAD3A0",
  paper: "#FFF8E6",
  wood: "#8B5A2B",
  woodDark: "#5B3A1E",
  ink: "#3B2412",
  inkSoft: "#6B4A2E",
  free: "#5DAA3C",
  freeDark: "#3D7A26",
  paid: "#8E5CC4",
  paidDark: "#5E3A8C",
  accent: "#C8412F",
  gold: "#F2C14E",
  sky: "#8FD3F4",
  water: "#6FB7D9",
  grass: "#9BCB6B",
  live: "#E8483A",
  white: "#FFFFFF",
  shadow: "#2A1A0C",
};

export const fonts = {
  heading: "PixelifySans_700Bold",
  headingRegular: "PixelifySans_400Regular",
  body: "VT323_400Regular",
};

/** Hard, offset pixel shadow (no blur) like the Stardew menus. */
export function pixelShadow(offset = 4): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: `${offset}px ${offset}px 0px ${colors.shadow}` } as ViewStyle,
    android: { elevation: 0, borderBottomWidth: 3 + offset / 2, borderRightWidth: 3 + offset / 2 },
    default: { shadowColor: colors.shadow, shadowOffset: { width: offset, height: offset }, shadowOpacity: 1, shadowRadius: 0 },
  })!;
}

export const text = {
  title: { fontFamily: fonts.heading, color: colors.accent, fontSize: 22, letterSpacing: 1 } satisfies TextStyle,
  h2: { fontFamily: fonts.heading, color: colors.ink, fontSize: 17 } satisfies TextStyle,
  label: { fontFamily: fonts.headingRegular, color: colors.ink, fontSize: 13 } satisfies TextStyle,
  body: { fontFamily: fonts.body, color: colors.ink, fontSize: 21, lineHeight: 22 } satisfies TextStyle,
  small: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 18, lineHeight: 19 } satisfies TextStyle,
};

export const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  music: { label: "Concerts", emoji: "🎸" },
  nightlife: { label: "Club nights", emoji: "🪩" },
  arts_culture: { label: "Arts & culture", emoji: "🎭" },
  gallery: { label: "Gallery openings", emoji: "🖼️" },
  film: { label: "Film screenings", emoji: "🎬" },
  food_drink: { label: "Food", emoji: "🍜" },
  market: { label: "Markets", emoji: "🧺" },
  festival: { label: "Festivals", emoji: "🎪" },
  comedy: { label: "Comedy", emoji: "🎤" },
  theatre: { label: "Theatre", emoji: "🎟️" },
  sports: { label: "Sports", emoji: "⚽" },
  workshop: { label: "Workshops", emoji: "🛠️" },
  community: { label: "Community", emoji: "🤝" },
  outdoors: { label: "Outdoors", emoji: "🌳" },
  family: { label: "All ages", emoji: "🧸" },
};
