import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(url || "https://not-configured.supabase.co", anonKey || "not-configured", {
  auth: {
    // Web uses localStorage (default); native persists the anonymous session in AsyncStorage.
    storage: Platform.OS === "web" ? undefined : AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});

let sessionPromise: Promise<string> | null = null;

/** Every visitor gets an anonymous Supabase account the first time they open the app. */
export function ensureSession(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) return data.session.user.id;
      const { data: signedIn, error } = await supabase.auth.signInAnonymously();
      if (error || !signedIn.user) throw new Error(error?.message ?? "Anonymous sign-in failed");
      return signedIn.user.id;
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}
