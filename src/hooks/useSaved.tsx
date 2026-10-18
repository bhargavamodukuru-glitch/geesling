import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchSaved, saveItem, unsaveItem } from "@/lib/api";
import { isConfigured } from "@/lib/supabase";
import type { MapItem, SavedItem, Walk } from "@/lib/types";

interface SavedContextValue {
  saved: SavedItem[];
  loading: boolean;
  error: string | null;
  isSaved: (kind: SavedItem["kind"], id: string) => boolean;
  toggle: (kind: SavedItem["kind"], id: string, snapshot: MapItem | Walk) => Promise<void>;
  refresh: () => Promise<void>;
}

const SavedContext = createContext<SavedContextValue | null>(null);

export function SavedProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    try {
      setSaved(await fetchSaved());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    fetchSaved()
      .then((rows) => {
        if (!cancelled) setSaved(rows);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isSaved = useCallback((kind: SavedItem["kind"], id: string) => saved.some((s) => s.kind === kind && s.item_id === id), [saved]);

  const toggle = useCallback(
    async (kind: SavedItem["kind"], id: string, snapshot: MapItem | Walk) => {
      const already = saved.some((s) => s.kind === kind && s.item_id === id);
      const previous = saved;
      // Optimistic update; roll back if the write fails.
      setSaved(already ? saved.filter((s) => !(s.kind === kind && s.item_id === id)) : [{ kind, item_id: id, snapshot, created_at: new Date().toISOString() }, ...saved]);
      try {
        if (already) await unsaveItem(kind, id);
        else await saveItem(kind, id, snapshot);
        setError(null);
      } catch (e) {
        setSaved(previous);
        setError((e as Error).message);
      }
    },
    [saved],
  );

  const value = useMemo(() => ({ saved, loading, error, isSaved, toggle, refresh }), [saved, loading, error, isSaved, toggle, refresh]);
  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved(): SavedContextValue {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSaved must be used inside SavedProvider");
  return ctx;
}
