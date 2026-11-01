/**
 * The record store. One bundle per person, keyed by the account it belongs to, with
 * the *active* one handed to the pages — so a care proxy reads and (if they have full
 * access) writes someone else's record through the very same screens. Which bundle is
 * active comes from the care-proxy layer, never from the page.
 *
 * Seeded from the demo data so every screen renders with real-feeling content; writes
 * (add / edit / delete / profile patch) update React state so the whole app stays
 * consistent. State is mirrored to localStorage, so edits survive a refresh (the mock
 * stand-in for a backend). When the DRF backend lands, these mutators become the
 * fetch/mutation calls and the seed goes away — the component API (useRecords) stays.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  emptyRecordBundle,
  type HealthProfile,
  type RecordBundle,
  type RecordCollections,
} from "@/types/health";
import { usePersistentState } from "@/lib/storage";
import { demoRecordBundles } from "@/data/mock";
import { useCareProxy } from "@/store/CareProxyContext";

/** The lists the app keeps. `profile` is separate — a single record, patched not
    listed. Each list item carries a string `id`. */
export type Collections = RecordCollections;

export type CollectionKey = keyof Collections;
type ItemOf<K extends CollectionKey> = Collections[K][number];

interface RecordsContextValue extends Collections {
  profile: HealthProfile;
  addItem: <K extends CollectionKey>(key: K, item: ItemOf<K>) => void;
  updateItem: <K extends CollectionKey>(key: K, id: string, patch: Partial<ItemOf<K>>) => void;
  removeItem: <K extends CollectionKey>(key: K, id: string) => void;
  updateProfile: (patch: Partial<HealthProfile>) => void;
}

const RecordsContext = createContext<RecordsContextValue | null>(null);

export function RecordsProvider({ children }: { children: ReactNode }) {
  // Every person's record, keyed by the account it belongs to.
  const [bundles, setBundles] = usePersistentState<Record<string, RecordBundle>>(
    "records",
    () => demoRecordBundles,
  );
  const { activeOwnerId, activeOwnerName } = useCareProxy();

  // Someone with nothing on file (a brand-new sign-up, or a record opened through a
  // proxy grant before it holds anything) still gets a record to render: empty.
  //
  // The second half of that is migration safety for existing data: a record saved
  // before condition-aware profiles existed has no `contexts` key. A missing list is
  // an empty list — it is never a reason to drop, migrate or rewrite the record.
  const bundle = useMemo(() => {
    const stored = bundles[activeOwnerId] ?? emptyRecordBundle(activeOwnerId, activeOwnerName);
    return Array.isArray(stored.contexts) ? stored : { ...stored, contexts: [] };
  }, [bundles, activeOwnerId, activeOwnerName]);

  /** Every write lands on the active record — the person's own, or the one they're viewing. */
  const patchBundle = useCallback(
    (mutate: (prev: RecordBundle) => RecordBundle) => {
      setBundles((prev) => {
        const current = prev[activeOwnerId] ?? emptyRecordBundle(activeOwnerId, activeOwnerName);
        return { ...prev, [activeOwnerId]: mutate(current) };
      });
    },
    [activeOwnerId, activeOwnerName, setBundles],
  );

  // New items go to the front so a just-added record is visible without scrolling.
  const addItem = useCallback(
    <K extends CollectionKey>(key: K, item: ItemOf<K>) => {
      patchBundle(
        (prev) => ({ ...prev, [key]: [item, ...(prev[key] as ItemOf<K>[])] }) as RecordBundle,
      );
    },
    [patchBundle],
  );

  const updateItem = useCallback(
    <K extends CollectionKey>(key: K, id: string, patch: Partial<ItemOf<K>>) => {
      patchBundle((prev) => {
        const list = prev[key] as Array<{ id: string }>;
        const next = list.map((it) => (it.id === id ? { ...it, ...(patch as object) } : it));
        return { ...prev, [key]: next } as RecordBundle;
      });
    },
    [patchBundle],
  );

  const removeItem = useCallback(
    <K extends CollectionKey>(key: K, id: string) => {
      patchBundle((prev) => {
        const list = prev[key] as Array<{ id: string }>;
        return { ...prev, [key]: list.filter((it) => it.id !== id) } as RecordBundle;
      });
    },
    [patchBundle],
  );

  const updateProfile = useCallback(
    (patch: Partial<HealthProfile>) => {
      patchBundle((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
    },
    [patchBundle],
  );

  const value = useMemo<RecordsContextValue>(
    () => ({
      profile: bundle.profile,
      allergies: bundle.allergies,
      medications: bundle.medications,
      conditions: bundle.conditions,
      appointments: bundle.appointments,
      documents: bundle.documents,
      immunizations: bundle.immunizations,
      procedures: bundle.procedures,
      vitals: bundle.vitals,
      contexts: bundle.contexts,
      addItem,
      updateItem,
      removeItem,
      updateProfile,
    }),
    [bundle, addItem, updateItem, removeItem, updateProfile],
  );

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords(): RecordsContextValue {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error("useRecords must be used within <RecordsProvider>");
  return ctx;
}
