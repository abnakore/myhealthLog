/**
 * Which condition-aware mode the app is in. Persisted per person, so the choice
 * survives a refresh, follows the user across every screen, and never bleeds
 * from one record into another when a proxy steps between records. Kept separate
 * from the record store because a mode is a lens over the same data, not data itself.
 *
 * The bridge to HealthContexts lives in components/modes/ModeSync: choosing a
 * mode opens (or closes) the matching profile, so the dashboard, nav and
 * emergency card all read one truth. The critical-condition id lives here too —
 * it names the condition Critical mode is focused on.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { usePersistentState } from "@/lib/storage";
import { useCareProxy } from "@/store/CareProxyContext";
import { asAppMode, appModeMeta, DEFAULT_MODE, type AppMode, type AppModeMeta } from "@/lib/appModes";

interface AppModeContextValue {
  mode: AppMode;
  meta: AppModeMeta;
  setMode: (mode: AppMode) => void;
  /** The condition Critical mode is focused on (condition id, per person). */
  criticalConditionId: string;
  setCriticalConditionId: (id: string) => void;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: ReactNode }) {
  const { activeOwnerId } = useCareProxy();
  const [byOwner, setByOwner] = usePersistentState<Record<string, AppMode>>("mode", {});
  const [criticalByOwner, setCriticalByOwner] = usePersistentState<Record<string, string>>(
    "mode.critical",
    {},
  );

  const mode = asAppMode(byOwner[activeOwnerId]);
  const criticalConditionId = criticalByOwner[activeOwnerId] ?? "";

  const setMode = useCallback(
    (next: AppMode) => setByOwner((prev) => ({ ...prev, [activeOwnerId]: next })),
    [activeOwnerId, setByOwner],
  );
  const setCriticalConditionId = useCallback(
    (id: string) => setCriticalByOwner((prev) => ({ ...prev, [activeOwnerId]: id })),
    [activeOwnerId, setCriticalByOwner],
  );

  // First-time visitors (and records seeded before modes existed) open in Normal.
  const value = useMemo<AppModeContextValue>(
    () => ({
      mode: mode || DEFAULT_MODE,
      meta: appModeMeta(mode || DEFAULT_MODE),
      setMode,
      criticalConditionId,
      setCriticalConditionId,
    }),
    [mode, setMode, criticalConditionId, setCriticalConditionId],
  );
  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode(): AppModeContextValue {
  const ctx = useContext(AppModeContext);
  if (!ctx) throw new Error("useAppMode must be used within <AppModeProvider>");
  return ctx;
}

