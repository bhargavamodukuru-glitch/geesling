// Sign-up choices and checks. Pure (tests/profile.test.ts); src/lib/account.ts talks to Supabase.

// Answers to "What brings you to Toronto?"
export const PERSONAS = [
  { id: "newcomer", label: "New to Toronto" },
  { id: "tourist", label: "Visiting" },
  { id: "student", label: "Student" },
  { id: "passing", label: "Passing through" },
  { id: "local", label: "Local" },
] as const;

export const AGE_RANGES = [
  { id: "under_18", label: "Under 18" },
  { id: "18_24", label: "18–24" },
  { id: "25_30", label: "25–30" },
  { id: "31_40", label: "31–40" },
  { id: "41_plus", label: "41+" },
] as const;

export type Persona = (typeof PERSONAS)[number]["id"];
export type AgeRange = (typeof AGE_RANGES)[number]["id"];

export interface Profile {
  email: string;
  phone: string | null;
  persona: Persona | null;
  age_range: AgeRange | null;
  marketing_opt_in: boolean;
}

/** "  Me@Example.com " → "me@example.com", or null when it isn't an email address. */
export function cleanEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/**
 * A phone number as people type it, normalised: "(416) 555-0199" → "+14165550199" (10 digits are taken as
 * Canada/US), "+44 20 7946 0958" stays international. Null when it isn't a plausible number.
 */
export function cleanPhone(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

