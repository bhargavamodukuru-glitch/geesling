import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo } from "react-native";

// Whether Geesling and the intro animate. On by default, off when the device's Reduce Motion is on, and the
// person's own choice (the ⏸/▶ switch next to day/night) wins over both. The switch is how moving content can be
// paused (WCAG 2.2.2), so animations can keep going for as long as they're on.
const KEY = "geesling.motion";

interface Motion {
  motion: boolean;
  toggleMotion: () => void;
}

const MotionContext = createContext<Motion>({ motion: true, toggleMotion: () => {} });

export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [choice, setChoice] = useState<boolean | null>(null);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        if (saved === "on" || saved === "off") setChoice(saved === "on");
      })
      .catch(() => {});
    return () => sub.remove();
  }, []);

  const motion = choice ?? !reduceMotion;
  const toggleMotion = useCallback(() => {
    setChoice(!motion);
    void AsyncStorage.setItem(KEY, motion ? "off" : "on").catch(() => {});
  }, [motion]);

  const value = useMemo(() => ({ motion, toggleMotion }), [motion, toggleMotion]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion(): Motion {
  return useContext(MotionContext);
}
