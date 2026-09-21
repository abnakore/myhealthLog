/**
 * Which condition-aware mode the app is in. Persisted, so the choice survives a
 * refresh and follows the user across every screen. Kept separate from the record
 * store because a mode is a lens over the same data, not data itself.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { usePersistentState } from "@/lib/storage";
import { appModeMeta, DEFAULT_MODE, type AppMode, type AppModeMeta } from "@/lib/appModes";

interface AppModeContextValue {
  mode: AppMode;
  meta: AppModeMeta;
  setMode: (mode: AppMode) => void;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = usePersistentState<AppMode>("mode", DEFAULT_MODE);
  const setMode = useCallback((next: AppMode) => setModeState(next), [setModeState]);
  const value = useMemo<AppModeContextValue>(
    () => ({ mode, meta: appModeMeta(mode), setMode }),
    [mode, setMode],
  );
  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode(): AppModeContextValue {
  const ctx = useContext(AppModeContext);
  if (!ctx) throw new Error("useAppMode must be used within <AppModeProvider>");
  return ctx;
}
