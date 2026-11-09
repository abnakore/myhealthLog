/**
 * Records store — backed by the real Django/DRF API.
 *
 * Design:
 *  - All 8 record types + profile are fetched once per "active owner" change.
 *  - State is held in React state (not localStorage) — the source of truth is
 *    now the backend database.
 *  - CRUD mutators call the API then update local state optimistically /
 *    consistently so the UI responds immediately and stays correct.
 *  - A care proxy reads someone else's record by passing the owner's ID to
 *    the backend (the backend returns only that user's data because every
 *    endpoint scopes to request.user — proxy access is handled server-side
 *    via the grant check). For Phase 2 the proxy endpoints are separate;
 *    here we fetch the signed-in user's own data and the CareProxyContext
 *    handles whose record is "active" for display.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/auth/AuthContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { setActAsUser } from "@/services/activeRecord";
import {
  emptyCollections,
  type HealthProfile,
  type RecordCollections,
} from "@/types/health";
import type { HealthContext } from "@/types/context";
import {
  fetchProfile,
  updateProfile as apiUpdateProfile,
  uploadPhoto as apiUploadPhoto,
  removePhoto as apiRemovePhoto,
  addEmergencyContact as apiAddContact,
  updateEmergencyContact as apiUpdateContact,
  deleteEmergencyContact as apiDeleteContact,
} from "@/services/profile";
import {
  fetchAllergies, createAllergy, updateAllergy, deleteAllergy,
  fetchMedications, createMedication, updateMedication, deleteMedication,
  fetchConditions, createCondition, updateCondition, deleteCondition,
  fetchAppointments, createAppointment, updateAppointment, deleteAppointment,
  fetchDocuments, createDocument, updateDocument, deleteDocument,
  fetchProcedures, createProcedure, updateProcedure, deleteProcedure,
  fetchImmunizations, createImmunization, updateImmunization, deleteImmunization,
  fetchVitals, createVital, updateVital, deleteVital,
} from "@/services/records";
import {
  fetchContexts,
  createContext as apiCreateContext,
  updateContext as apiUpdateContext,
  deleteContext as apiDeleteContext,
} from "@/services/contexts";
import type {
  Allergy, Appointment, Condition, HealthDocument,
  Immunization, Medication, Procedure, VitalReading, EmergencyContact,
} from "@/types/health";

export type Collections = RecordCollections;
export type CollectionKey = keyof Collections;
type ItemOf<K extends CollectionKey> = Collections[K][number];

interface RecordsContextValue extends Collections {
  profile: HealthProfile;
  isLoading: boolean;
  error: string | null;

  // Generic mutations — components use these so they don't import services
  addItem: <K extends CollectionKey>(key: K, item: ItemOf<K>) => Promise<void>;
  updateItem: <K extends CollectionKey>(
    key: K,
    id: string,
    patch: Partial<ItemOf<K>>,
  ) => Promise<void>;
  removeItem: <K extends CollectionKey>(key: K, id: string) => Promise<void>;
  updateProfile: (patch: Partial<HealthProfile>) => Promise<void>;
  uploadProfilePhoto: (file: File) => Promise<void>;
  removeProfilePhoto: () => Promise<void>;

  // Emergency contact helpers (profile sub-resource)
  addEmergencyContact: (contact: Omit<EmergencyContact, "id">) => Promise<void>;
  updateEmergencyContact: (id: string, patch: Partial<Omit<EmergencyContact, "id">>) => Promise<void>;
  removeEmergencyContact: (id: string) => Promise<void>;

  /** True once the first load finished — lets pages tell "not there" from
   *  "not fetched yet". */
  hasLoaded: boolean;

  /** Reload all data for the current user (e.g. after onboarding). */
  refresh: () => Promise<void>;
}

const RecordsContext = createContext<RecordsContextValue | null>(null);

function buildEmptyProfile(name: string, id: string): HealthProfile {
  return { id, fullName: name, emergencyContacts: [] };
}

/** Contexts live in their own state so a context edit doesn't re-render every list. */
function collectionsWithoutContexts(): Omit<RecordCollections, "contexts"> {
  const { contexts: _contexts, ...rest } = emptyCollections();
  return rest;
}

export function RecordsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthed } = useAuth();
  // Which record the person is looking at. When a care proxy steps into a
  // relative's record this changes, and every shelf below is fetched again from
  // that owner's side of the API.
  const { activeOwnerId } = useCareProxy();

  const [profile, setProfile] = useState<HealthProfile>(
    () => buildEmptyProfile(user?.name ?? "", user?.id ?? ""),
  );
  const [collections, setCollections] = useState<Omit<RecordCollections, "contexts">>(
    collectionsWithoutContexts,
  );
  const [contexts, setContexts] = useState<HealthContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch all data whenever the authenticated user changes
  // ---------------------------------------------------------------------------
  const loadAll = useCallback(async () => {
    if (!isAuthed) {
      setProfile(buildEmptyProfile("", ""));
      setCollections(collectionsWithoutContexts());
      setContexts([]);
      return;
    }
    // Set the acting owner before the first request goes out. The proxy store
    // also syncs this, but its effect runs after this component's (children's
    // effects fire first), so relying on it alone fetched the proxy's own record
    // on the render where the switch happened.
    setActAsUser(activeOwnerId && activeOwnerId !== user?.id ? activeOwnerId : null);
    setIsLoading(true);
    setError(null);
    try {
      const [
        prof,
        allergies,
        medications,
        conditions,
        appointments,
        documents,
        procedures,
        immunizations,
        vitals,
        ctxs,
      ] = await Promise.all([
        fetchProfile(),
        fetchAllergies(),
        fetchMedications(),
        fetchConditions(),
        fetchAppointments(),
        fetchDocuments(),
        fetchProcedures(),
        fetchImmunizations(),
        fetchVitals(),
        fetchContexts(),
      ]);
      setProfile(prof);
      setCollections({ allergies, medications, conditions, appointments, documents, procedures, immunizations, vitals } as never);
      setContexts(ctxs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load your records.";
      setError(msg);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [isAuthed, activeOwnerId, user?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ---------------------------------------------------------------------------
  // Profile mutations
  // ---------------------------------------------------------------------------

  const updateProfile = useCallback(async (patch: Partial<HealthProfile>) => {
    // Map frontend HealthProfile fields to backend snake_case
    const backendPatch: Record<string, unknown> = {};
    if (patch.fullName !== undefined)    backendPatch.full_name = patch.fullName;
    if (patch.dateOfBirth !== undefined) backendPatch.date_of_birth = patch.dateOfBirth;
    if (patch.sex !== undefined)         backendPatch.sex = patch.sex;
    if (patch.bloodType !== undefined)   backendPatch.blood_type = patch.bloodType;
    if (patch.genotype !== undefined)    backendPatch.genotype = patch.genotype;
    if (patch.heightCm !== undefined)    backendPatch.height_cm = patch.heightCm;
    if (patch.weightKg !== undefined)    backendPatch.weightKg = patch.weightKg;
    if (patch.phone !== undefined)       backendPatch.phone = patch.phone;
    if (patch.city !== undefined)        backendPatch.city = patch.city;
    if (patch.state !== undefined)       backendPatch.state = patch.state;
    if (patch.country !== undefined)     backendPatch.country = patch.country;
    if (patch.address !== undefined)     backendPatch.address = patch.address;
    // photoUrl is handled via uploadProfilePhoto
    const updated = await apiUpdateProfile(backendPatch as never);
    setProfile((prev) => ({ ...prev, ...updated, emergencyContacts: prev.emergencyContacts }));
  }, []);

  const uploadProfilePhoto = useCallback(async (file: File) => {
    const updated = await apiUploadPhoto(file);
    setProfile((prev) => ({ ...prev, photoUrl: updated.photoUrl }));
  }, []);

  const removeProfilePhoto = useCallback(async () => {
    const updated = await apiRemovePhoto();
    setProfile((prev) => ({ ...prev, photoUrl: updated.photoUrl }));
  }, []);

  // ---------------------------------------------------------------------------
  // Emergency contact mutations
  // ---------------------------------------------------------------------------

  const addEmergencyContact = useCallback(
    async (contact: Omit<EmergencyContact, "id">) => {
      const created = await apiAddContact(contact);
      setProfile((prev) => ({
        ...prev,
        emergencyContacts: [...prev.emergencyContacts, created],
      }));
    },
    [],
  );

  const updateEmergencyContact = useCallback(
    async (id: string, patch: Partial<Omit<EmergencyContact, "id">>) => {
      const updated = await apiUpdateContact(id, patch);
      setProfile((prev) => ({
        ...prev,
        emergencyContacts: prev.emergencyContacts.map((c) =>
          c.id === id ? updated : c,
        ),
      }));
    },
    [],
  );

  const removeEmergencyContact = useCallback(async (id: string) => {
    await apiDeleteContact(id);
    setProfile((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.filter((c) => c.id !== id),
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // Generic CRUD helpers — dispatch to the right service
  // ---------------------------------------------------------------------------

  const addItem = useCallback(
    async <K extends CollectionKey>(key: K, item: ItemOf<K>) => {
      let created: ItemOf<K>;

      if (key === "allergies") {
        created = (await createAllergy(item as Partial<Allergy>)) as ItemOf<K>;
        setCollections((c) => ({ ...c, allergies: [created as Allergy, ...c.allergies] }));
      } else if (key === "medications") {
        const m = item as Medication & { file?: File | null };
        created = (await createMedication(m)) as ItemOf<K>;
        setCollections((c) => ({ ...c, medications: [created as Medication, ...c.medications] }));
      } else if (key === "conditions") {
        const cn = item as Condition & { file?: File | null };
        created = (await createCondition(cn)) as ItemOf<K>;
        setCollections((c) => ({ ...c, conditions: [created as Condition, ...c.conditions] }));
      } else if (key === "appointments") {
        created = (await createAppointment(item as Partial<Appointment>)) as ItemOf<K>;
        setCollections((c) => ({ ...c, appointments: [created as Appointment, ...c.appointments] }));
      } else if (key === "documents") {
        const d = item as HealthDocument & { file: File };
        created = (await createDocument(d)) as ItemOf<K>;
        setCollections((c) => ({ ...c, documents: [created as HealthDocument, ...c.documents] }));
      } else if (key === "procedures") {
        created = (await createProcedure(item as Partial<Procedure>)) as ItemOf<K>;
        setCollections((c) => ({ ...c, procedures: [created as Procedure, ...c.procedures] }));
      } else if (key === "immunizations") {
        created = (await createImmunization(item as Partial<Immunization>)) as ItemOf<K>;
        setCollections((c) => ({ ...c, immunizations: [created as Immunization, ...c.immunizations] }));
      } else if (key === "vitals") {
        const v = item as VitalReading & { file?: File | null };
        created = (await createVital(v)) as ItemOf<K>;
        setCollections((c) => ({ ...c, vitals: [created as VitalReading, ...c.vitals] }));
      } else if (key === "contexts") {
        const ctx = item as HealthContext;
        created = (await apiCreateContext(ctx)) as ItemOf<K>;
        setContexts((prev) => [created as HealthContext, ...prev]);
      } else {
        throw new Error(`Unknown collection key: ${key}`);
      }
    },
    [],
  );

  const updateItem = useCallback(
    async <K extends CollectionKey>(key: K, id: string, patch: Partial<ItemOf<K>>) => {
      if (key === "allergies") {
        const updated = await updateAllergy(id, patch as Partial<Allergy>);
        setCollections((c) => ({ ...c, allergies: c.allergies.map((a) => a.id === id ? updated : a) }));
      } else if (key === "medications") {
        const updated = await updateMedication(id, patch as Partial<Medication> & { file?: File | null });
        setCollections((c) => ({ ...c, medications: c.medications.map((m) => m.id === id ? updated : m) }));
      } else if (key === "conditions") {
        const updated = await updateCondition(id, patch as Partial<Condition> & { file?: File | null });
        setCollections((c) => ({ ...c, conditions: c.conditions.map((cn) => cn.id === id ? updated : cn) }));
      } else if (key === "appointments") {
        const updated = await updateAppointment(id, patch as Partial<Appointment>);
        setCollections((c) => ({ ...c, appointments: c.appointments.map((a) => a.id === id ? updated : a) }));
      } else if (key === "documents") {
        const updated = await updateDocument(id, patch as Partial<HealthDocument> & { file?: File | null });
        setCollections((c) => ({ ...c, documents: c.documents.map((d) => d.id === id ? updated : d) }));
      } else if (key === "procedures") {
        const updated = await updateProcedure(id, patch as Partial<Procedure>);
        setCollections((c) => ({ ...c, procedures: c.procedures.map((p) => p.id === id ? updated : p) }));
      } else if (key === "immunizations") {
        const updated = await updateImmunization(id, patch as Partial<Immunization>);
        setCollections((c) => ({ ...c, immunizations: c.immunizations.map((im) => im.id === id ? updated : im) }));
      } else if (key === "vitals") {
        const updated = await updateVital(id, patch as Partial<VitalReading> & { file?: File | null });
        setCollections((c) => ({ ...c, vitals: c.vitals.map((v) => v.id === id ? updated : v) }));
      } else if (key === "contexts") {
        const updated = await apiUpdateContext(id, patch as Partial<HealthContext>);
        setContexts((prev) => prev.map((ctx) => ctx.id === id ? updated : ctx));
      }
    },
    [],
  );

  const removeItem = useCallback(
    async <K extends CollectionKey>(key: K, id: string) => {
      if (key === "allergies") {
        await deleteAllergy(id);
        setCollections((c) => ({ ...c, allergies: c.allergies.filter((a) => a.id !== id) }));
      } else if (key === "medications") {
        await deleteMedication(id);
        setCollections((c) => ({ ...c, medications: c.medications.filter((m) => m.id !== id) }));
      } else if (key === "conditions") {
        await deleteCondition(id);
        setCollections((c) => ({ ...c, conditions: c.conditions.filter((cn) => cn.id !== id) }));
      } else if (key === "appointments") {
        await deleteAppointment(id);
        setCollections((c) => ({ ...c, appointments: c.appointments.filter((a) => a.id !== id) }));
      } else if (key === "documents") {
        await deleteDocument(id);
        setCollections((c) => ({ ...c, documents: c.documents.filter((d) => d.id !== id) }));
      } else if (key === "procedures") {
        await deleteProcedure(id);
        setCollections((c) => ({ ...c, procedures: c.procedures.filter((p) => p.id !== id) }));
      } else if (key === "immunizations") {
        await deleteImmunization(id);
        setCollections((c) => ({ ...c, immunizations: c.immunizations.filter((im) => im.id !== id) }));
      } else if (key === "vitals") {
        await deleteVital(id);
        setCollections((c) => ({ ...c, vitals: c.vitals.filter((v) => v.id !== id) }));
      } else if (key === "contexts") {
        await apiDeleteContext(id);
        setContexts((prev) => prev.filter((ctx) => ctx.id !== id));
      }
    },
    [],
  );

  const value = useMemo<RecordsContextValue>(
    () => ({
      profile,
      isLoading,
      hasLoaded,
      error,
      ...((collections as unknown) as Omit<RecordCollections, "contexts">),
      contexts,
      addItem,
      updateItem,
      removeItem,
      updateProfile,
      uploadProfilePhoto,
      removeProfilePhoto,
      addEmergencyContact,
      updateEmergencyContact,
      removeEmergencyContact,
      refresh: loadAll,
    }),
    [
      profile, isLoading, hasLoaded, error, collections, contexts,
      addItem, updateItem, removeItem, updateProfile, uploadProfilePhoto,
      removeProfilePhoto, addEmergencyContact, updateEmergencyContact,
      removeEmergencyContact, loadAll,
    ],
  );

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords(): RecordsContextValue {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error("useRecords must be used within <RecordsProvider>");
  return ctx;
}
