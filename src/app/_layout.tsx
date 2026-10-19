import { PixelifySans_400Regular, PixelifySans_700Bold } from "@expo-google-fonts/pixelify-sans";
import { VT323_400Regular } from "@expo-google-fonts/vt323";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SavedProvider } from "@/hooks/useSaved";
import { ensureSession, isConfigured } from "@/lib/supabase";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ PixelifySans_400Regular, PixelifySans_700Bold, VT323_400Regular });

  useEffect(() => {
    if (isConfigured) ensureSession().catch((e) => console.warn("Anonymous sign-in failed:", (e as Error).message));
  }, []);

  // Web can render with system fallbacks while its custom fonts download; avoid
  // blocking the first usable screen on a phone's initial visit.
  if (Platform.OS !== "web" && !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.parchment }}>
        <ActivityIndicator color={colors.wood} />
      </View>
    );
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
