/**
 * The in-memory record store. Seeded from the demo data so every screen renders
 * with real-feeling content; writes (add / edit / delete / profile patch) update
 * React state so the whole app stays consistent within a session. When the DRF
 * backend lands, these mutators become the fetch/mutation calls and the seed goes
 * away — the component API (useRecords) stays the same.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Allergy,
  Appointment,
  Condition,
  HealthDocument,
  HealthProfile,
  Immunization,
  Medication,
  Procedure,
  VitalReading,
} from "@/types/health";
import {
  demoAllergies,
  demoAppointments,
  demoConditions,
  demoDocuments,
  demoImmunizations,
  demoMedications,
  demoProcedures,
  demoProfile,
  demoVitals,
} from "@/data/mock";

/** Every list the app keeps. `profile` is separate — a single record, patched not
    listed. Each list item carries a string `id`. */
interface Collections {
  allergies: Allergy[];
  medications: Medication[];
  conditions: Condition[];
  appointments: Appointment[];
  documents: HealthDocument[];
  immunizations: Immunization[];
  procedures: Procedure[];
  vitals: VitalReading[];
}

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
  const [profile, setProfile] = useState<HealthProfile>(demoProfile);
  const [collections, setCollections] = useState<Collections>({
    allergies: demoAllergies,
    medications: demoMedications,
    conditions: demoConditions,
    appointments: demoAppointments,
    documents: demoDocuments,
    immunizations: demoImmunizations,
    procedures: demoProcedures,
    vitals: demoVitals,
  });

  // New items go to the front so a just-added record is visible without scrolling.
  const addItem = useCallback(<K extends CollectionKey>(key: K, item: ItemOf<K>) => {
    setCollections((prev) => {
      const list = prev[key] as Array<ItemOf<K>>;
      return { ...prev, [key]: [item, ...list] } as Collections;
    });
  }, []);

  const updateItem = useCallback(
    <K extends CollectionKey>(key: K, id: string, patch: Partial<ItemOf<K>>) => {
      setCollections((prev) => {
        const list = prev[key] as Array<{ id: string }>;
        const next = list.map((it) => (it.id === id ? { ...it, ...(patch as object) } : it));
        return { ...prev, [key]: next } as Collections;
      });
    },
    [],
  );

  const removeItem = useCallback(<K extends CollectionKey>(key: K, id: string) => {
    setCollections((prev) => {
      const list = prev[key] as Array<{ id: string }>;
      return { ...prev, [key]: list.filter((it) => it.id !== id) } as Collections;
    });
  }, []);

  const updateProfile = useCallback((patch: Partial<HealthProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo<RecordsContextValue>(
    () => ({
      profile,
      ...collections,
      addItem,
      updateItem,
      removeItem,
      updateProfile,
    }),
    [profile, collections, addItem, updateItem, removeItem, updateProfile],
  );

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords(): RecordsContextValue {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error("useRecords must be used within <RecordsProvider>");
  return ctx;
}
