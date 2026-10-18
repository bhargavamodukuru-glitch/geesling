import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";

export type LatLng = { lat: number; lng: number };

/** Foreground location. Asks once on mount; `locate()` re-asks (the "Near me" button). */
export function useLocation() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<"idle" | "locating" | "granted" | "denied" | "error">("idle");

  const locate = useCallback(async (): Promise<LatLng | null> => {
    setStatus("locating");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setStatus("denied");
        return null;
      }
      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 120_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const next = { lat: position.coords.latitude, lng: position.coords.longitude };
      setLocation(next);
      setStatus("granted");
      return next;
    } catch {
      setStatus("error");
      return null;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === "granted") await locate();
    })();
  }, [locate]);

  return { location, status, locate };
}
