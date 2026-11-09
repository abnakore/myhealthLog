/**
 * Sharing & safety store — backed by the real API.
 *
 * Manages:
 *  - Care providers (share codes)
 *  - Emergency settings (token, PIN, toggles)
 *
 * Note: The "Connections" feature (Samsung Health etc.) remains a local-only
 * mock because there is no real integration backend. That section of the UI
 * is clearly labelled as a demo.
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
import type { CareProvider, EmergencySettings, Connection } from "@/types/sharing";
import {
  fetchProviders,
  createProvider as apiCreateProvider,
  resetProviderPin as apiResetProviderPin,
  removeProviderPin as apiRemoveProviderPin,
  revokeProvider as apiRevokeProvider,
  deleteProvider as apiDeleteProvider,
  fetchEmergencySettings,
  updateEmergencySettings as apiUpdateEmergency,
  regenerateEmergencyToken as apiRegenerateToken,
  type CreateProviderParams,
  type CreateProviderResult,
} from "@/services/sharing";
import { defaultEmergencySettings } from "@/lib/emergency";
import { apiErrorMessage } from "@/services/api";

interface SharingContextValue {
  providers: CareProvider[];
  connections: Connection[];
  emergency: EmergencySettings;
  isLoading: boolean;
  error: string | null;

  // Provider operations
  addProvider: (params: CreateProviderParams) => Promise<CreateProviderResult>;
  resetProviderPin: (id: string, pin: string) => Promise<void>;
  removeProviderPin: (id: string) => Promise<void>;
  revokeProvider: (id: string) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;

  // Emergency operations
  updateEmergency: (patch: Partial<EmergencySettings>) => Promise<void>;
  regenerateToken: () => Promise<EmergencySettings>;

  // Connections (local mock — no real backend integration)
  isConnected: (sourceId: string) => boolean;
  connect: (sourceId: string) => void;
  disconnect: (sourceId: string) => void;
  syncConnection: (sourceId: string) => void;
}

const SharingContext = createContext<SharingContextValue | null>(null);

export function SharingProvider({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();

  const [providers, setProviders] = useState<CareProvider[]>([]);
  const [emergency, setEmergency] = useState<EmergencySettings>(defaultEmergencySettings);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load on auth
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthed) {
      setProviders([]);
      setEmergency(defaultEmergencySettings());
      return;
    }
    setIsLoading(true);
    Promise.all([fetchProviders(), fetchEmergencySettings()])
      .then(([provs, settings]) => {
        setProviders(provs);
        setEmergency(settings);
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }, [isAuthed]);

  // ---------------------------------------------------------------------------
  // Provider operations
  // ---------------------------------------------------------------------------

  const addProvider = useCallback(
    async (params: CreateProviderParams): Promise<CreateProviderResult> => {
      const result = await apiCreateProvider(params);
      setProviders((prev) => [result.provider, ...prev]);
      return result;
    },
    [],
  );

  const resetProviderPin = useCallback(async (id: string, pin: string) => {
    const updated = await apiResetProviderPin(id, pin);
    setProviders((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  const removeProviderPin = useCallback(async (id: string) => {
    const updated = await apiRemoveProviderPin(id);
    setProviders((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  const revokeProvider = useCallback(async (id: string) => {
    const updated = await apiRevokeProvider(id);
    setProviders((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  const removeProvider = useCallback(async (id: string) => {
    await apiDeleteProvider(id);
    setProviders((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ---------------------------------------------------------------------------
  // Emergency operations
  // ---------------------------------------------------------------------------

  const updateEmergency = useCallback(async (patch: Partial<EmergencySettings>) => {
    // Map frontend camelCase to backend snake_case
    const backendPatch: Record<string, unknown> = {};
    if (patch.pinEnabled !== undefined)     backendPatch.pin_enabled = patch.pinEnabled;
    if (patch.pin !== undefined && patch.pin) backendPatch.pin = patch.pin;
    if (!patch.pinEnabled && patch.pinEnabled !== undefined) {
      backendPatch.pin_enabled = false;
    }
    if (patch.showBloodType !== undefined)  backendPatch.show_blood_type = patch.showBloodType;
    if (patch.showAllergies !== undefined)  backendPatch.show_allergies = patch.showAllergies;
    if (patch.showMedications !== undefined) backendPatch.show_medications = patch.showMedications;
    if (patch.showConditions !== undefined) backendPatch.show_conditions = patch.showConditions;
    if (patch.showContacts !== undefined)   backendPatch.show_contacts = patch.showContacts;
    if (patch.showNote !== undefined)       backendPatch.show_note = patch.showNote;
    if (patch.note !== undefined)           backendPatch.note = patch.note;

    const updated = await apiUpdateEmergency(backendPatch as never);
    // Preserve the token we have (backend doesn't return it on PATCH)
    setEmergency((prev) => ({ ...updated, token: prev.token }));
  }, []);

  const regenerateToken = useCallback(async (): Promise<EmergencySettings> => {
    const updated = await apiRegenerateToken();
    setEmergency(updated);
    return updated;
  }, []);

  // ---------------------------------------------------------------------------
  // Connections (local mock)
  // ---------------------------------------------------------------------------

  const isConnected = useCallback(
    (sourceId: string) => connections.some((c) => c.sourceId === sourceId),
    [connections],
  );

  const connect = useCallback((sourceId: string) => {
    const now = new Date().toISOString();
    setConnections((prev) =>
      prev.some((c) => c.sourceId === sourceId)
        ? prev
        : [...prev, { sourceId, connectedAt: now, lastSync: now }],
    );
  }, []);

  const disconnect = useCallback((sourceId: string) => {
    setConnections((prev) => prev.filter((c) => c.sourceId !== sourceId));
  }, []);

  const syncConnection = useCallback((sourceId: string) => {
    const now = new Date().toISOString();
    setConnections((prev) =>
      prev.map((c) => (c.sourceId === sourceId ? { ...c, lastSync: now } : c)),
    );
  }, []);

  const value = useMemo<SharingContextValue>(
    () => ({
      providers,
      connections,
      emergency,
      isLoading,
      error,
      addProvider,
      resetProviderPin,
      removeProviderPin,
      revokeProvider,
      removeProvider,
      updateEmergency,
      regenerateToken,
      isConnected,
      connect,
      disconnect,
      syncConnection,
    }),
    [
      providers, connections, emergency, isLoading, error,
      addProvider, resetProviderPin, removeProviderPin, revokeProvider, removeProvider, updateEmergency, regenerateToken,
      isConnected, connect, disconnect, syncConnection,
    ],
  );

  return <SharingContext.Provider value={value}>{children}</SharingContext.Provider>;
}

export function useSharing(): SharingContextValue {
  const ctx = useContext(SharingContext);
  if (!ctx) throw new Error("useSharing must be used within <SharingProvider>");
  return ctx;
}
