/**
 * Which health context the app is reading the record through.
 *
 * Kept separate from the record store for the same reason the mode store is separate
 * from it: a context is a lens, not data. Nothing here writes a clinical field — it
 * records *which* lens is open, and the only thing it can create or remove is the lens
 * itself.
 *
 * Two properties worth stating, because they are the feature:
 *
 *  • The active context is remembered per person. A proxy stepping into their mother's
 *    record sees her contexts, not the ones they were last looking at on their own
 *    record — an asthma profile can never bleed across from one record into another.
 *  • Deactivating or removing a context removes a *view*. No record is ever touched:
 *    removeContext takes an id out of the contexts list and leaves every other
 *    collection exactly as it was.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { usePersistentState } from "@/lib/storage";
import { useCareProxy } from "@/store/CareProxyContext";
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
  /** Every condition-aware profile on file for the record on screen. */
  contexts: HealthContext[];
  /** The context currently shaping the app; "" in Normal mode. */
  activeId: string;
  active?: HealthContext;
  /** The name of the active context — the condition's own name, or "Pregnancy". */
  activeLabel: string;
  /** The pregnancy context on file, if the person has one. */
  pregnancy?: HealthContext;

  activate: (id: string) => void;
  /** Back to Normal mode: the complete record, nothing hidden, nothing deleted. */
  deactivate: () => void;

  /** Open (or re-open) the profile for a condition already on file. Returns its id. */
  openCondition: (condition: Condition) => string;
  /** Open (or re-open) the pregnancy profile. Returns its id. */
  openPregnancy: () => string;
  /** The profile for a condition, if one is already on file. */
  contextFor: (conditionId: string) => HealthContext | undefined;

  /** Context-specific facts — only the ones a generic health record can't hold. */
  updatePregnancy: (id: string, patch: Partial<PregnancyContext>) => void;
  /** Removes the lens. Records are untouched — the profile is the only thing that goes. */
  removeContext: (id: string) => void;
}

const ContextsContext = createContext<ContextsContextValue | null>(null);

export function ContextsProvider({ children }: { children: ReactNode }) {
  const { activeOwnerId } = useCareProxy();
  const { conditions, contexts, addItem, updateItem, removeItem } = useRecords();
  // The active lens is remembered per person, so two records never share one.
  const [activeByOwner, setActiveByOwner] = usePersistentState<Record<string, string>>(
    "contexts.active",
    {},
  );

  const activeId = activeByOwner[activeOwnerId] ?? "";
  const active = contexts.find((c) => c.id === activeId);

  const activate = useCallback(
    (id: string) => setActiveByOwner((prev) => ({ ...prev, [activeOwnerId]: id })),
    [activeOwnerId, setActiveByOwner],
  );

  const deactivate = useCallback(
    () => setActiveByOwner((prev) => ({ ...prev, [activeOwnerId]: "" })),
    [activeOwnerId, setActiveByOwner],
  );

  const openCondition = useCallback(
    (condition: Condition) => {
      const existing = contextForCondition(contexts, condition.id);
      if (existing) {
        activate(existing.id);
        return existing.id;
      }
      const created = conditionContext(condition);
      addItem("contexts", created);
      activate(created.id);
      return created.id;
    },
    [contexts, addItem, activate],
  );

  const openPregnancy = useCallback(() => {
    const existing = findPregnancy(contexts);
    if (existing) {
      activate(existing.id);
      return existing.id;
    }
    const created = pregnancyContext();
    addItem("contexts", created);
    activate(created.id);
    return created.id;
  }, [contexts, addItem, activate]);

  const updatePregnancy = useCallback(
    (id: string, patch: Partial<PregnancyContext>) => {
      const current = contexts.find((c) => c.id === id);
      updateItem("contexts", id, {
        pregnancy: { ...(current?.pregnancy ?? { status: "ONGOING" }), ...patch },
        updatedAt: new Date().toISOString(),
      });
    },
    [contexts, updateItem],
  );

  // Removing a lens removes one row from the contexts list and nothing else — the
  // medications, labs and visits it was pointing at stay exactly where they were.
  const removeContext = useCallback(
    (id: string) => {
      removeItem("contexts", id);
      setActiveByOwner((prev) => (prev[activeOwnerId] === id ? { ...prev, [activeOwnerId]: "" } : prev));
    },
    [removeItem, setActiveByOwner, activeOwnerId],
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
      contextFor: (conditionId: string) => contextForCondition(contexts, conditionId),
      updatePregnancy,
      removeContext,
    }),
    [
      contexts,
      activeId,
      active,
      conditions,
      activate,
      deactivate,
      openCondition,
      openPregnancy,
      updatePregnancy,
      removeContext,
    ],
  );

  return <ContextsContext.Provider value={value}>{children}</ContextsContext.Provider>;
}

export function useContexts(): ContextsContextValue {
  const ctx = useContext(ContextsContext);
  if (!ctx) throw new Error("useContexts must be used within <ContextsProvider>");
  return ctx;
}

