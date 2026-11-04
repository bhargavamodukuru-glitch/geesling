// "About you" details, saved against the device's anonymous Supabase account. No sign-in codes: the details are
// for understanding who uses Geesling (and for updates when someone opts in), not for logging in.
import type { AgeRange, Persona, Profile } from "./profile";
import { ensureSession, supabase } from "./supabase";

export async function saveProfile(details: { email: string; phone: string | null; persona: Persona | null; ageRange: AgeRange | null; marketing: boolean }): Promise<void> {
  await ensureSession();
  const { error } = await supabase.rpc("save_profile", {
    p_email: details.email,
    p_phone: details.phone,
    p_persona: details.persona,
    p_age_range: details.ageRange,
    p_marketing: details.marketing,
  });
  if (error) throw new Error(error.message);
}

export async function fetchProfile(): Promise<Profile | null> {
  await ensureSession();
  const { data, error } = await supabase.rpc("my_profile");
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}

/** Forgets the saved details; the app keeps working as before. */
export async function deleteProfile(): Promise<void> {
  const { error } = await supabase.rpc("delete_my_profile");
  if (error) throw new Error(error.message);
}
