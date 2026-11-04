import { useCallback, useEffect, useState } from "react";
import { fetchProfile } from "@/lib/account";
import type { Profile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

/** The "about you" details this device has shared, if any. */
export function useAccount() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setProfile(await fetchProfile().catch(() => null));
    setReady(true);
  }, []);

  // Supabase reports the current session as soon as this subscribes (INITIAL_SESSION), then every change.
  // Deferred a tick, as Supabase advises, so its own lock is free before the session is read again.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => void refresh(), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  return { profile, ready, refresh, signedUp: profile !== null };
}
