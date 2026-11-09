/**
 * Storage utilities.
 *
 * The app is backed by the real Django/DRF API — clinical data (records, profile,
 * sharing, proxy grants) lives in the database, not localStorage.
 *
 * This module retains:
 *  - `loadJSON` / `saveJSON` / `storageKey` — still imported by lib/emergency.ts
 *    and lib/providerAccess.ts (kept for the URL/path helpers those files export)
 *  - `usePersistentState` — used by AppModeContext for UI-mode preferences
 *
 * `resetDemoData` is kept as a no-op stub so Profile.tsx compiles without change;
 * the "Reset to sample data" UI button is hidden because there is no more demo data.
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const SCHEMA_VERSION = "v3";

/** Namespaced, versioned localStorage key, e.g. storageKey("mode") → "mhl.mode.v3" */
export function storageKey(name: string): string {
  return `mhl.${name}.${SCHEMA_VERSION}`;
}

/** Load JSON from localStorage, returning `fallback` on any error. */
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write JSON to localStorage — silently swallows quota / private-mode errors. */
export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage unavailable — non-fatal */
  }
}

/**
 * Lightweight persistent state for UI preferences (app mode, active context id)
 * that should survive a page refresh but are NOT health data.
 *
 * Do NOT use this for clinical data — that belongs in the API-backed stores.
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    const seed = typeof initial === "function" ? (initial as () => T)() : initial;
    return loadJSON(key, seed);
  });

  useEffect(() => {
    saveJSON(key, state);
  }, [key, state]);

  return [state, setState];
}

/**
 * No-op stub — kept so existing Profile.tsx code compiles without changes.
 * The "Reset to sample data" button is hidden by the Profile page since there
 * is no longer any demo data to reset to.
 */
export function resetDemoData(): void {
  // Nothing to reset — data lives in the backend database now.
}
