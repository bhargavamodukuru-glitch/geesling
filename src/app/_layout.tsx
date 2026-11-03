import { PixelifySans_400Regular, PixelifySans_700Bold } from "@expo-google-fonts/pixelify-sans";
import { VT323_400Regular } from "@expo-google-fonts/vt323";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SavedProvider } from "@/hooks/useSaved";
import { GeeslingLoader } from "@/components/GeeslingLoader";
import { ensureSession, isConfigured } from "@/lib/supabase";
import { colors } from "@/lib/theme";

// Web: a thick dark focus ring with a gold halo, so keyboard focus shows on every colour in the app (WCAG 2.4.7).
const FOCUS_CSS = `:focus-visible { outline: 3px solid ${colors.ink} !important; outline-offset: 2px; box-shadow: 0 0 0 6px ${colors.gold} !important; }`;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ PixelifySans_400Regular, PixelifySans_700Bold, VT323_400Regular });

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent = FOCUS_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    if (isConfigured) ensureSession().catch((e) => console.warn("Anonymous sign-in failed:", (e as Error).message));
  }, []);

  // Web can render with system fallbacks while its custom fonts download; avoid
  // blocking the first usable screen on a phone's initial visit.
  if (Platform.OS !== "web" && !fontsLoaded) {
    return <GeeslingLoader label="Geesling is getting ready…" />;
  }

  return (
    <SafeAreaProvider>
      <SavedProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.parchment } }} />
      </SavedProvider>
    </SafeAreaProvider>
  );
}
