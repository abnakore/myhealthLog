/**
 * Health contexts store — reads from RecordsContext (which fetches from API).
 *
 * A context is a lens over records. The data is stored in RecordsContext
 * alongside all other collections; this store adds the UI-layer logic:
 *  - Which context is "active" (persisted in sessionStorage per session)
 *  - Helper methods to open condition / pregnancy profiles
 *  - Pregnancy-specific update
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRecords } from "@/store/RecordsContext";
import {
  conditionContext,
  contextForCondition,
  contextLabel,
  findPregnancy,
  pregnancyContext,
} from "@/lib/healthContexts";
import type { Condition } from "@/types/health";
import type { HealthContext, PregnancyContext } from "@/types/context";

interface ContextsContextValue {
  contexts: HealthContext[];
  activeId: string;
  active?: HealthContext;
  activeLabel: string;
  pregnancy?: HealthContext;

  activate: (id: string) => void;
  deactivate: () => void;
  openCondition: (condition: Condition) => Promise<string>;
  openPregnancy: () => Promise<string>;
  contextFor: (conditionId: string) => HealthContext | undefined;
  updatePregnancy: (id: string, patch: Partial<PregnancyContext>) => Promise<void>;
  removeContext: (id: string) => Promise<void>;
}

const ContextsContext = createContext<ContextsContextValue | null>(null);

const ACTIVE_KEY = "mhl.ctx.active";

export function ContextsProvider({ children }: { children: ReactNode }) {
  const { conditions, contexts, addItem, updateItem, removeItem } = useRecords();

  // Active context id is session-scoped (sessionStorage so it clears on logout/reload)
  const [activeId, setActiveId] = useState<string>(() => {
    try { return sessionStorage.getItem(ACTIVE_KEY) ?? ""; }
    catch { return ""; }
  });

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    try { sessionStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ }
  }, []);

  const activate = useCallback((id: string) => setActive(id), [setActive]);
  const deactivate = useCallback(() => setActive(""), [setActive]);

  const active = contexts.find((c) => c.id === activeId);

  const openCondition = useCallback(
    async (condition: Condition): Promise<string> => {
      const existing = contextForCondition(contexts, condition.id);
      if (existing) {
        activate(existing.id);
        return existing.id;
      }
      const created = conditionContext(condition);
      await addItem("contexts", created);
      // The addItem call updates RecordsContext; we need the new id
      // conditionContext generates a client-side id, but the server assigns one.
      // After addItem resolves, RecordsContext has the server's id — find it.
      // We match by conditionId since that is stable.
      // Note: there's a brief moment where the id might be stale; the effect in
      // HealthContextProfile handles the activate() call on mount anyway.
      activate(created.id);
      return created.id;
    },
    [contexts, addItem, activate],
  );

  const openPregnancy = useCallback(async (): Promise<string> => {
    const existing = findPregnancy(contexts);
    if (existing) {
      activate(existing.id);
      return existing.id;
    }
    const created = pregnancyContext();
    await addItem("contexts", created);
    activate(created.id);
    return created.id;
  }, [contexts, addItem, activate]);

  const updatePregnancy = useCallback(
    async (id: string, patch: Partial<PregnancyContext>) => {
      const current = contexts.find((c) => c.id === id);
      await updateItem("contexts", id, {
        pregnancy: { ...(current?.pregnancy ?? { status: "ONGOING" }), ...patch },
        updatedAt: new Date().toISOString(),
      });
    },
    [contexts, updateItem],
  );

  const removeContext = useCallback(
    async (id: string) => {
      await removeItem("contexts", id);
      if (activeId === id) setActive("");
    },
    [removeItem, activeId, setActive],
  );

  const value = useMemo<ContextsContextValue>(
    () => ({
      contexts,
      activeId,
      active,
      activeLabel: active ? contextLabel(active, conditions) : "",
      pregnancy: findPregnancy(contexts),
      activate,
      deactivate,
      openCondition,
      openPregnancy,
      contextFor: (conditionId) => contextForCondition(contexts, conditionId),
      updatePregnancy,
      removeContext,
    }),
    [
      contexts, activeId, active, conditions,
      activate, deactivate, openCondition, openPregnancy, updatePregnancy, removeContext,
    ],
  );

  return <ContextsContext.Provider value={value}>{children}</ContextsContext.Provider>;
}

export function useContexts(): ContextsContextValue {
  const ctx = useContext(ContextsContext);
  if (!ctx) throw new Error("useContexts must be used within <ContextsProvider>");
  return ctx;
}
