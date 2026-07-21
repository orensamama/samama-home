"use client";

import { useEffect, useState } from "react";

/**
 * Client-only persisted state. Initializes with `initialValue` (so SSR and
 * the first client render match), then hydrates from localStorage after
 * mount and keeps localStorage in sync on every change. This is the shared
 * "sync-ready" pattern other family data (tasks, shopping, events) can plug
 * into once a real backend replaces localStorage.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        // Hydrating from an external system (localStorage) after mount is
        // the documented exception to this rule; it must run in an effect
        // since localStorage isn't available during SSR.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue(JSON.parse(stored) as T);
      }
    } catch {
      // ignore malformed or inaccessible storage
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore write errors (storage full or disabled)
    }
  }, [key, value, hydrated]);

  return [value, setValue] as const;
}
