/**
 * The sharing & safety store — care providers, circle of trust, connected apps,
 * and emergency-card settings. Seeded from the demo data and mirrored to
 * localStorage so grants, connections and toggles survive a refresh (the mock
 * stand-in for the backend's Share / Consent tables). When the DRF backend lands,
 * these mutators become the API calls and the seed goes away; the component API
 * (useSharing) stays the same.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { CareProvider, CareProxy, Connection, EmergencySettings } from "@/types/sharing";
import { usePersistentState } from "@/lib/storage";
import { demoConnections, demoEmergencySettings, demoProviders, demoProxies } from "@/data/mock";

interface SharingContextValue {
  providers: CareProvider[];
  proxies: CareProxy[];
  connections: Connection[];
  emergency: EmergencySettings;

  addProvider: (provider: CareProvider) => void;
  updateProvider: (id: string, patch: Partial<CareProvider>) => void;
  removeProvider: (id: string) => void;

  addProxy: (proxy: CareProxy) => void;
  updateProxy: (id: string, patch: Partial<CareProxy>) => void;
  removeProxy: (id: string) => void;

  isConnected: (sourceId: string) => boolean;
  connect: (sourceId: string) => void;
  disconnect: (sourceId: string) => void;
  syncConnection: (sourceId: string) => void;

  updateEmergency: (patch: Partial<EmergencySettings>) => void;
}

const SharingContext = createContext<SharingContextValue | null>(null);

/** Every emergency-settings write stamps `updatedAt`, so "Last updated" is always true. */
function withStamp(patch: Partial<EmergencySettings>): Partial<EmergencySettings> {
  return { ...patch, updatedAt: new Date().toISOString() };
}

export function SharingProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = usePersistentState<CareProvider[]>(
    "sharing.providers",
    () => demoProviders,
  );
  const [proxies, setProxies] = usePersistentState<CareProxy[]>("sharing.proxies", () => demoProxies);
  const [connections, setConnections] = usePersistentState<Connection[]>(
    "sharing.connections",
    () => demoConnections,
  );
  const [emergency, setEmergency] = usePersistentState<EmergencySettings>(
    "sharing.emergency",
    () => demoEmergencySettings,
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

  const addProxy = useCallback((proxy: CareProxy) => {
    setProxies((prev) => [proxy, ...prev]);
  }, []);

  const updateProxy = useCallback((id: string, patch: Partial<CareProxy>) => {
    setProxies((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const removeProxy = useCallback((id: string) => {
    setProxies((prev) => prev.filter((p) => p.id !== id));
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

  const updateEmergency = useCallback((patch: Partial<EmergencySettings>) => {
    setEmergency((prev) => ({ ...prev, ...withStamp(patch) }));
  }, []);

  const value = useMemo<SharingContextValue>(
    () => ({
      providers,
      proxies,
      connections,
      emergency,
      addProvider,
      updateProvider,
      removeProvider,
      addProxy,
      updateProxy,
      removeProxy,
      isConnected,
      connect,
      disconnect,
      syncConnection,
      updateEmergency,
    }),
    [
      providers,
      proxies,
      connections,
      emergency,
      addProvider,
      updateProvider,
      removeProvider,
      addProxy,
      updateProxy,
      removeProxy,
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
