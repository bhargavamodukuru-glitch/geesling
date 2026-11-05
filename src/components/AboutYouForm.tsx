import { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { PixelButton } from "@/components/Pixel";
import { saveProfile } from "@/lib/account";
import { askPushPermission, disablePush, enablePush, pushSupported } from "@/lib/push";
import { AGE_RANGES, PERSONAS, cleanEmail, cleanPhone, type AgeRange, type Persona, type Profile } from "@/lib/profile";
import { colors, fonts, text } from "@/lib/theme";

interface Props {
  /** Details to start from when editing. */
  initial?: Profile | null;
  /** Called once the details are saved. */
  onSaved: () => void;
  /** A second, quieter button beside Save (Cancel when editing, Skip for now on the opening screen). */
  secondary?: { label: string; onPress: () => void };
}

const CONTACT_EMAIL = "geeslingthegoose@outlook.com";

/** The "about you" questions: email, phone, what brings them to Toronto, age range and the updates opt-in. */
export function AboutYouForm({ initial = null, onSaved, secondary }: Props) {
  const [emailInput, setEmailInput] = useState(initial?.email ?? "");
  const [phoneInput, setPhoneInput] = useState(initial?.phone ?? "");
  const [persona, setPersona] = useState<Persona | null>(initial?.persona ?? null);
  const [ageRange, setAgeRange] = useState<AgeRange | null>(initial?.age_range ?? null);
  const [marketing, setMarketing] = useState(initial?.marketing_opt_in ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    // Ask for notification permission right away, while this still counts as the tap (browsers require that).
    const permission = marketing && pushSupported() ? askPushPermission() : null;
    setBusy(true);
    setError(null);
    try {
      const email = cleanEmail(emailInput);
      if (!email) throw new Error("Enter a valid email address.");
      const phone = cleanPhone(phoneInput);
      if (!phone) throw new Error("Enter a phone number, e.g. 416 555 0199.");
      await saveProfile({ email, phone, persona, ageRange, marketing });
      // Notifications follow the box: on if ticked and the browser allows them, off (and forgotten) if not.
      // A problem here never blocks saving the details.
      if (permission) await enablePush(await permission).catch(() => false);
      else if (!marketing) await disablePush().catch(() => {});
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };


  return (
    <View style={styles.form}>
      <Field label="Email" value={emailInput} onChange={setEmailInput} placeholder="you@example.com" keyboard="email-address" autoComplete="email" />
      <Field label="Phone" value={phoneInput} onChange={setPhoneInput} placeholder="416 555 0199" keyboard="phone-pad" autoComplete="tel" />
      <Dropdown label="What brings you to Toronto?" options={PERSONAS} value={persona} onChange={setPersona} placeholder="Choose one" />
      <Text style={styles.label}>Age</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Your age range">
        {AGE_RANGES.map((a) => (
          <PixelButton key={a.id} label={a.label} small active={ageRange === a.id} onPress={() => setAgeRange(ageRange === a.id ? null : a.id)} />
        ))}
      </View>
      <Check checked={marketing} label="Send me Geesling updates by email, text or notification (optional)" onToggle={() => setMarketing(!marketing)} />
      {marketing && pushSupported() ? (
        <Text style={text.small}>Your browser will ask to allow notifications: a heads-up at 8:30 am and, on weekdays, at 5 pm.</Text>
      ) : null}
      <Text style={text.small}>
        We use your details to understand who uses Geesling, and to send updates only if you tick the box. Contact{" "}
        <Text style={styles.mailLink} accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>
          {CONTACT_EMAIL}
        </Text>{" "}
        for any questions or concerns.
      </Text>
      {error ? <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text> : null}
      <View style={styles.actions}>
        <PixelButton label={busy ? "Saving…" : "Save"} tone="red" disabled={busy} onPress={() => void save()} />
        {secondary ? <PixelButton label={secondary.label} small disabled={busy} onPress={secondary.onPress} /> : null}
      </View>
    </View>
  );
}

/** A tap-to-open list for picking one answer, styled like the rest of Geesling (works the same on web and phones). */
function Dropdown<T extends string>({ label, options, value, onChange, placeholder }: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(!open)}
        style={styles.select}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${selected ? selected.label : "not chosen"}`}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
      >
        <Text style={[text.body, !selected && { color: colors.inkSoft }]}>{selected?.label ?? placeholder}</Text>
        <Text style={styles.caret}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open ? (
        <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={label}>
          {options.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => {
                onChange(o.id);
                setOpen(false);
              }}
              style={[styles.option, o.id === value && styles.optionOn]}
              accessibilityRole="radio"
              accessibilityState={{ checked: o.id === value }}
              aria-checked={o.id === value}
            >
              <Text style={text.body}>{o.label}</Text>
              {o.id === value ? <Text style={styles.caret}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboard, autoComplete }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboard: "email-address" | "phone-pad";
  autoComplete: "email" | "tel";
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        keyboardType={keyboard}
        autoComplete={autoComplete}
        textContentType={autoComplete === "email" ? "emailAddress" : "telephoneNumber"}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        style={styles.input}
        {...(Platform.OS === "web" ? { inputMode: keyboard === "email-address" ? "email" : "tel" } : {})}
      />
    </View>
  );
}

function Check({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked} accessibilityLabel={label}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Text style={styles.tick}>✓</Text> : null}</View>
      <Text style={[text.small, { flex: 1, color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  label: { fontFamily: fonts.heading, fontSize: 13, color: colors.ink },
  input: { borderWidth: 3, borderColor: colors.ink, backgroundColor: colors.white, paddingHorizontal: 10, paddingVertical: 8, fontFamily: fonts.body, fontSize: 21, color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 3, borderColor: colors.ink, backgroundColor: colors.white, paddingHorizontal: 10, paddingVertical: 8, minHeight: 44 },
  caret: { fontFamily: fonts.heading, fontSize: 13, color: colors.ink },
  options: { borderWidth: 3, borderTopWidth: 0, borderColor: colors.ink, backgroundColor: colors.white },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 10, minHeight: 44, borderTopWidth: 1, borderColor: colors.parchmentDark },
  optionOn: { backgroundColor: colors.parchment },
  check: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  box: { width: 24, height: 24, borderWidth: 3, borderColor: colors.ink, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.freeDark },
  tick: { color: colors.white, fontFamily: fonts.heading, fontSize: 14, lineHeight: 16 },
  error: { fontFamily: fonts.body, fontSize: 18, color: colors.accent },
  mailLink: { color: colors.ink, textDecorationLine: "underline" },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
});
