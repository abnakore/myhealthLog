/**
 * The sharing & safety store — care providers, connected apps, and emergency-card
 * settings. Seeded from the demo data and mirrored to localStorage so grants,
 * connections and toggles survive a refresh (the mock stand-in for the backend's
 * Share / Consent tables). When the DRF backend lands, these mutators become the API
 * calls and the seed goes away; the component API (useSharing) stays the same.
 *
 * Emergency settings are keyed by person, not held once: the code belongs to the
 * record it opens, so `emergency` is the card of whoever the app is showing — which
 * is what lets a proxy see their relative's real card while only the owner can change
 * it. Care proxy access itself lives in its own store (store/CareProxyContext.tsx).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { CareProvider, Connection, EmergencySettings } from "@/types/sharing";
import { defaultEmergencySettings, emergencySettingsFor } from "@/lib/emergency";
import { usePersistentState } from "@/lib/storage";
import { useCareProxy } from "@/store/CareProxyContext";
import { demoConnections, demoEmergencySettingsByOwner, demoProviders } from "@/data/mock";

interface SharingContextValue {
  providers: CareProvider[];
  connections: Connection[];
  /** The emergency card of the record currently on screen. */
  emergency: EmergencySettings;

  addProvider: (provider: CareProvider) => void;
  updateProvider: (id: string, patch: Partial<CareProvider>) => void;
  removeProvider: (id: string) => void;

  isConnected: (sourceId: string) => boolean;
  connect: (sourceId: string) => void;
  disconnect: (sourceId: string) => void;
  syncConnection: (sourceId: string) => void;

  /** Writes to the signed-in user's own card — the only one they may change. */
  updateEmergency: (patch: Partial<EmergencySettings>) => void;
}

const SharingContext = createContext<SharingContextValue | null>(null);

/** Every emergency-settings write stamps `updatedAt`, so "Last updated" is always true. */
function withStamp(patch: Partial<EmergencySettings>): Partial<EmergencySettings> {
  return { ...patch, updatedAt: new Date().toISOString() };
}

export function SharingProvider({ children }: { children: ReactNode }) {
  const { activeOwnerId, selfId } = useCareProxy();
  const [providers, setProviders] = usePersistentState<CareProvider[]>(
    "sharing.providers",
    () => demoProviders,
  );
  const [connections, setConnections] = usePersistentState<Connection[]>(
    "sharing.connections",
    () => demoConnections,
  );
  const [emergencyByOwner, setEmergencyByOwner] = usePersistentState<
    Record<string, EmergencySettings>
  >("sharing.emergency", () => demoEmergencySettingsByOwner);

  // A record that has never had a card gets one the moment it's opened, and it is
  // written straight away: the token shown must be the token the public view will
  // validate, or the QR on screen would lead nowhere.
  useEffect(() => {
    setEmergencyByOwner((prev) =>
      prev[activeOwnerId] ? prev : { ...prev, [activeOwnerId]: defaultEmergencySettings() },
    );
  }, [activeOwnerId, setEmergencyByOwner]);

  // Until that write lands, a stable stand-in — recomputed only when the owner (or
  // the persisted map) changes, so the code on screen doesn't churn between renders.
  const emergency = useMemo(
    () => emergencyByOwner[activeOwnerId] ?? defaultEmergencySettings(),
    [emergencyByOwner, activeOwnerId],
  );

  // New grants go to the front so a just-created share is visible without scrolling.
  const addProvider = useCallback((provider: CareProvider) => {
    setProviders((prev) => [provider, ...prev]);
  }, []);

  const updateProvider = useCallback((id: string, patch: Partial<CareProvider>) => {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const removeProvider = useCallback((id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
  }, []);

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
    setConnections((prev) => prev.map((c) => (c.sourceId === sourceId ? { ...c, lastSync: now } : c)));
  }, []);

  const updateEmergency = useCallback(
    (patch: Partial<EmergencySettings>) => {
      setEmergencyByOwner((prev) => ({
        ...prev,
        [selfId]: { ...emergencySettingsFor(prev, selfId), ...withStamp(patch) },
      }));
    },
    [selfId, setEmergencyByOwner],
  );

  const value = useMemo<SharingContextValue>(
    () => ({
      providers,
      connections,
      emergency,
      addProvider,
      updateProvider,
      removeProvider,
      isConnected,
      connect,
      disconnect,
      syncConnection,
      updateEmergency,
    }),
    [
      providers,
      connections,
      emergency,
      addProvider,
      updateProvider,
      removeProvider,
      isConnected,
      connect,
      disconnect,
      syncConnection,
      updateEmergency,
    ],
  );

  return <SharingContext.Provider value={value}>{children}</SharingContext.Provider>;
}

export function useSharing(): SharingContextValue {
  const ctx = useContext(SharingContext);
  if (!ctx) throw new Error("useSharing must be used within <SharingProvider>");
  return ctx;
}
