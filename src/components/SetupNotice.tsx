import { StyleSheet, Text, View } from "react-native";
import { Goose } from "@/components/Goose";
import { Panel } from "@/components/Pixel";
import { colors, text } from "@/lib/theme";

/** Shown when the app was built without Supabase settings (see README → Setup). */
export function SetupNotice() {
  return (
    <View style={styles.wrap}>
      <Panel style={styles.panel}>
        <Goose size={5} />
        <Text style={text.title}>Geesling needs its pond</Text>
        <Text style={text.body}>Copy .env.example to .env and fill in:</Text>
        <Text style={styles.code}>EXPO_PUBLIC_SUPABASE_URL{"\n"}EXPO_PUBLIC_SUPABASE_ANON_KEY</Text>
        <Text style={text.small}>Then restart `npx expo start`. The README walks through creating the Supabase project.</Text>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: colors.grass },
  panel: { maxWidth: 420, gap: 10, alignItems: "center" },
  code: { ...text.body, backgroundColor: colors.parchment, padding: 8, borderWidth: 2, borderColor: colors.wood },
});
