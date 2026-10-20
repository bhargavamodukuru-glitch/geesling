import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Goose } from "@/components/Goose";
import { Panel, PixelButton } from "@/components/Pixel";
import {
  AREAS,
  BUDGETS,
  BUDGET_WORDING,
  DEFAULT_PREFERENCES,
  TIMES,
  TRAVELS,
  VIBES,
  buildPlanRequest,
  type AreaId,
  type LatLng,
  type PlanPreferences,
  type PlanRequest,
  type Vibe,
} from "@/lib/planner";
import { colors, fonts, text } from "@/lib/theme";

interface Props {
  /** Set when the person tapped a home-screen shortcut: the vibe step is already answered. */
  initialVibe: Vibe | null;
  /** Set by "Adjust": reopen the planner with the last choices filled in, starting from the first question. */
  initialPrefs?: PlanPreferences;
  /** Location already granted earlier, if any. Permission is only asked when "Near me" is tapped. */
  userLocation: LatLng | null;
  onLocate: () => Promise<LatLng | null>;
  onSubmit: (request: PlanRequest) => void;
  onCancel: () => void;
}

const STEPS = 3;

const QUESTIONS = [
  "What kind of outing is it?",
  "How long have you got, and what's the budget?",
  "Where are we starting, and how are you getting around?",
];

function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

export function PlannerFlow({ initialVibe, initialPrefs, userLocation, onLocate, onSubmit, onCancel }: Props) {
  const [step, setStep] = useState(initialVibe ? 1 : 0);
  const [prefs, setPrefs] = useState<PlanPreferences>(() =>
    initialPrefs
      ? // "Near me" can only be reused while location is still available.
        { ...initialPrefs, area: initialPrefs.area === "near" && !userLocation ? DEFAULT_PREFERENCES.area : initialPrefs.area }
      : {
          ...DEFAULT_PREFERENCES,
          vibe: initialVibe ?? DEFAULT_PREFERENCES.vibe,
          area: userLocation ? "near" : DEFAULT_PREFERENCES.area,
        },
  );
  const [nearCoords, setNearCoords] = useState<LatLng | null>(userLocation);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  const set = <K extends keyof PlanPreferences>(key: K, value: PlanPreferences[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  const pickArea = async (id: AreaId) => {
    setLocationNote(null);
    if (id !== "near") return set("area", id);
    if (nearCoords) return set("area", "near");
    setLocating(true);
    const found = await onLocate();
    setLocating(false);
    if (found) {
      setNearCoords(found);
      set("area", "near");
    } else {
      setLocationNote("Location is off, so pick a starting area below instead.");
    }
  };

  const submit = () => onSubmit(buildPlanRequest(prefs, nearCoords));
  // From a shortcut the vibe is already answered, so "Back" on the first visible step leaves the planner.
  const atStart = step === 0 || (step === 1 && initialVibe !== null);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Goose size={2.2} walking={false} />
        </View>
        <Panel style={styles.question} shadow={3}>
          <Text style={styles.step}>
            STEP {step + 1} OF {STEPS}
          </Text>
          <Text style={text.body}>{QUESTIONS[step]}</Text>
        </Panel>
      </View>

      <Panel tone="parchment" style={styles.card} shadow={3}>
        {step === 0 ? (
          <Chips>
            {VIBES.map((v) => (
              <PixelButton
                key={v.id}
                label={v.label}
                icon={v.icon}
                active={prefs.vibe === v.id}
                onPress={() => {
                  set("vibe", v.id);
                  setStep(1);
                }}
              />
            ))}
          </Chips>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.group}>TIME</Text>
            <Chips>
              {TIMES.map((t) => (
                <PixelButton key={t.id} label={t.label} icon={t.icon} small active={prefs.time === t.id} onPress={() => set("time", t.id)} />
              ))}
            </Chips>
            <Text style={styles.group}>{BUDGET_WORDING[prefs.vibe].heading}</Text>
            <Chips>
              {BUDGETS.map((b) => (
                <PixelButton key={b.id} label={b.label} icon={b.icon} small active={prefs.budget === b.id} onPress={() => set("budget", b.id)} />
              ))}
            </Chips>
            <Text style={text.small}>{BUDGET_WORDING[prefs.vibe].note}</Text>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.group}>START</Text>
            <Chips>
              {AREAS.map((a) => (
                <PixelButton
                  key={a.id}
                  label={a.id === "near" && locating ? "Finding you…" : a.label}
                  icon={a.icon}
                  small
                  disabled={locating}
                  active={prefs.area === a.id}
                  onPress={() => void pickArea(a.id)}
                />
              ))}
            </Chips>
            {locationNote ? <Text style={[text.small, styles.note]}>{locationNote}</Text> : null}
            <Text style={styles.group}>GETTING AROUND</Text>
            <Chips>
              {TRAVELS.map((t) => (
                <PixelButton key={t.id} label={t.label} icon={t.icon} small active={prefs.travel === t.id} onPress={() => set("travel", t.id)} />
              ))}
            </Chips>
          </>
        ) : null}
      </Panel>

      <View style={styles.nav}>
        <PixelButton label="← Back" small onPress={() => (atStart ? onCancel() : setStep(step - 1))} />
        <View style={{ flex: 1 }} />
        {step === 0 && initialPrefs ? <PixelButton label="Next →" tone="gold" onPress={() => setStep(1)} /> : null}
        {step === 1 ? <PixelButton label="Next →" tone="gold" onPress={() => setStep(2)} /> : null}
        {step === 2 ? <PixelButton label="Plan it" tone="red" disabled={locating} onPress={submit} /> : null}
      </View>
      {step > 0 ? (
        <Text style={styles.defaults} onPress={locating ? undefined : submit} accessibilityRole="link">
          Skip the rest and use the highlighted choices
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  header: { flexDirection: "row", alignItems: "flex-end", gap: 9 },
  avatar: { width: 38, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink },
  question: { flex: 1, gap: 2, padding: 12, backgroundColor: colors.paper },
  step: { fontFamily: fonts.heading, fontSize: 11, color: colors.accent },
  card: { gap: 8 },
  group: { fontFamily: fonts.heading, fontSize: 11, color: colors.inkSoft, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  note: { color: colors.accent },
  nav: { flexDirection: "row", alignItems: "center", gap: 8 },
  // Paper pill so the link stays readable over the skyline backdrop in day and night scenes.
  defaults: { alignSelf: "center", fontFamily: fonts.body, fontSize: 18, color: colors.ink, textDecorationLine: "underline", backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" },
});
