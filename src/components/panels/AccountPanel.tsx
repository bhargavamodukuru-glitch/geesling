import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Goose } from "@/components/Goose";
import { Panel, PixelButton } from "@/components/Pixel";
import { useAccount } from "@/hooks/useAccount";
import { deleteProfile, saveProfile } from "@/lib/account";
import { AGE_RANGES, PERSONAS, cleanEmail, cleanPhone, type AgeRange, type Persona } from "@/lib/profile";
import { colors, fonts, text } from "@/lib/theme";

/** "About you": email, phone, who they are and their age range, plus an optional updates opt-in. */
export function AccountPanel() {
  const { profile, ready, refresh, signedUp } = useAccount();
  const [editing, setEditing] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setEmailInput(profile?.email ?? "");
    setPhoneInput(profile?.phone ?? "");
    setPersona(profile?.persona ?? null);
    setAgeRange(profile?.age_range ?? null);
    setMarketing(profile?.marketing_opt_in ?? false);
    setEditing(true);
  };

  const save = () =>
    run(async () => {
      const email = cleanEmail(emailInput);
      if (!email) throw new Error("Enter a valid email address.");
      const phone = cleanPhone(phoneInput);
      if (!phone) throw new Error("Enter a phone number, e.g. 416 555 0199.");
      await saveProfile({ email, phone, persona, ageRange, marketing });
      await refresh();
      setEditing(false);
    });

  if (!ready) return null;

  if (signedUp && !editing) {
    const personaLabel = PERSONAS.find((p) => p.id === profile?.persona)?.label;
    const ageLabel = AGE_RANGES.find((a) => a.id === profile?.age_range)?.label;
    return (
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Hello line="Honk, thanks! Now I know a bit about who I’m waddling around with." />
        <Panel style={styles.card} shadow={3}>
          <Row label="Email" value={profile?.email ?? ""} />
          <Row label="Phone" value={profile?.phone ?? "Not added"} />
          <Row label="In Toronto" value={personaLabel ?? "Not set"} />
          <Row label="Age" value={ageLabel ?? "Not set"} />
          <Row label="Updates" value={profile?.marketing_opt_in ? "Yes, by email or text" : "No"} />
        </Panel>
        {error ? <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text> : null}
        <View style={styles.actions}>
          <PixelButton label="Edit" small disabled={busy} onPress={startEditing} />
          {confirmingDelete ? (
            <PixelButton
              label="Yes, delete my details"
              tone="red"
              small
              disabled={busy}
              onPress={() =>
                run(async () => {
                  await deleteProfile();
                  setConfirmingDelete(false);
                  await refresh();
                })
              }
            />
          ) : (
            <PixelButton label="Delete my details" small disabled={busy} onPress={() => setConfirmingDelete(true)} />
          )}
        </View>
        {confirmingDelete ? <Text style={text.small}>This removes your email, phone and answers. You can keep using Geesling as before.</Text> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Hello line="Tell me a little about you! It helps me plan better days out for people like you." />
      <Panel style={styles.card} shadow={3}>
        <Field label="Email" value={emailInput} onChange={setEmailInput} placeholder="you@example.com" keyboard="email-address" autoComplete="email" />
        <Field label="Phone" value={phoneInput} onChange={setPhoneInput} placeholder="416 555 0199" keyboard="phone-pad" autoComplete="tel" />
        <Dropdown label="What brings you to Toronto?" options={PERSONAS} value={persona} onChange={setPersona} placeholder="Choose one" />
        <Text style={styles.label}>Age</Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Your age range">
          {AGE_RANGES.map((a) => (
            <PixelButton key={a.id} label={a.label} small active={ageRange === a.id} onPress={() => setAgeRange(ageRange === a.id ? null : a.id)} />
          ))}
        </View>
        <Check checked={marketing} label="Send me Geesling updates by email or text (optional)" onToggle={() => setMarketing(!marketing)} />
        <Text style={text.small}>
          We use your details to understand who uses Geesling, and to send updates only if you tick the box. We never sell them, and you can delete them any time.
        </Text>
        {error ? <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text> : null}
        <View style={styles.actions}>
          <PixelButton label={busy ? "Saving…" : "Save"} tone="red" disabled={busy} onPress={save} />
          {editing ? <PixelButton label="Cancel" small disabled={busy} onPress={() => setEditing(false)} /> : null}
        </View>
      </Panel>
    </ScrollView>
  );
}

function Hello({ line }: { line: string }) {
  return (
    <View style={styles.hello}>
      <Goose size={3} walking={false} />
      <Panel style={styles.bubble} shadow={3}>
        <Text style={styles.speaker}>GEESLING</Text>
        <Text style={text.body}>{line}</Text>
      </Panel>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[text.body, { flex: 1, textAlign: "right" }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 12, gap: 12 },
  hello: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bubble: { flex: 1, gap: 4, padding: 10, backgroundColor: colors.paper },
  speaker: { fontFamily: fonts.heading, fontSize: 12, color: colors.accent, letterSpacing: 1 },
  card: { gap: 10, padding: 14, backgroundColor: colors.paper },
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
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 2, borderColor: colors.parchmentDark, paddingBottom: 6 },
});
