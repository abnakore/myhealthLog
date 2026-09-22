/**
 * The mock persistence layer. Everything the app lets you change — profile, records,
 * app mode, sharing — is JSON-serialisable, so it survives a refresh in localStorage
 * here and swaps to real API reads/writes when the Django/DRF backend lands.
 *
 * Keys are namespaced `mhl.*` and versioned. Bump SCHEMA_VERSION when a stored shape
 * changes so a returning demo falls back to a fresh seed instead of choking on stale
 * data. Auth owns its own key ("mhl.auth.user") and predates this — it's left alone.
 * Writes are wrapped: a full quota or private-mode throw is non-fatal, the app just
 * runs for that session without persisting.
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const SCHEMA_VERSION = "v3";

/** Namespaced, versioned key for a stored slice, e.g. storageKey("profile") → "mhl.profile.v1". */
export function storageKey(name: string): string {
  return `mhl.${name}.${SCHEMA_VERSION}`;
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage unavailable — carry on without persistence */
  }
}

/**
 * `useState`, mirrored to localStorage under a namespaced, versioned key. First mount
 * reads the stored value (or the seed if there's nothing yet); every change writes back.
 */
export function usePersistentState<T>(
  name: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const key = storageKey(name);
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
 * Wipe everything this app has persisted (records, profile, mode, sharing) while
 * keeping the sign-in (auth key) intact, then let the caller reload to reseed from
 * the demo data. The prefix sweep means new slices are covered automatically.
 */
export function resetDemoData(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith("mhl.") && !k.startsWith("mhl.auth.")) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable — nothing to reset */
  }
}
