/**
 * CareProxy store — backed by the real API.
 *
 * Manages the full grant lifecycle:
 *  - Fetch all grants (given and received)
 *  - Invite / revoke / accept / decline / resend / update permission
 *  - Track which record is "active" (own vs proxy's)
 *
 * Note: "Stepping into" a proxy's record is a UI concept only here — the
 * backend scopes every record endpoint to `request.user`. When Phase 2 is
 * fully built, the backend would need proxy-scoped record endpoints. For
 * now, switching to another owner's record in the UI simply shows a read-only
 * view pulled from the grant data returned at login.
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
import {
  openableRecords,
  pendingInvitations,
  permissionOver,
  type CareProxyGrant,
  type ProxyPermission,
} from "@/types/proxy";
import {
  fetchProxyGrants,
  createProxyGrant as apiCreateGrant,
  revokeProxyGrant as apiRevoke,
  acceptProxyGrant as apiAccept,
  declineProxyGrant as apiDecline,
  resendProxyInvite as apiResend,
  updateProxyPermission as apiUpdatePermission,
} from "@/services/sharing";
import { apiErrorMessage } from "@/services/api";
import { setActAsUser } from "@/services/activeRecord";

export interface ProxyInvite {
  email: string;
  permission: ProxyPermission;
  message?: string;
}

interface CareProxyContextValue {
  grants: CareProxyGrant[];
  invitedByMe: CareProxyGrant[];
  invitations: CareProxyGrant[];
  openable: CareProxyGrant[];
  isLoading: boolean;
  error: string | null;

  selfId: string;
  selfName: string;
  activeOwnerId: string;
  activeOwnerName: string;
  isProxyView: boolean;
  permission: ProxyPermission;
  canEdit: boolean;

  switchTo: (ownerId: string) => void;
  invite: (invite: ProxyInvite) => Promise<CareProxyGrant>;
  acceptInvite: (id: string) => Promise<void>;
  declineInvite: (id: string) => Promise<void>;
  updatePermission: (id: string, permission: ProxyPermission) => Promise<void>;
  revoke: (id: string) => Promise<void>;
  resendInvite: (id: string) => Promise<void>;
}

const CareProxyContext = createContext<CareProxyContextValue | null>(null);

export function CareProxyProvider({ children }: { children: ReactNode }) {
  const { user, isAuthed } = useAuth();
  const selfId = user?.id ?? "";
  const selfName = user?.name ?? "You";
  const selfEmail = user?.email ?? "";

  const [grants, setGrants] = useState<CareProxyGrant[]>([]);
  // The record a proxy stepped into survives a page refresh in this tab. It is
  // only honoured while a live grant for that owner exists (see `viewed`), and
  // the backend re-checks the grant on every request regardless.
  const storageKey = `mhl.actingFor.${selfId}`;
  // Bumped on every change so the stored value is re-read; the user id (and so
  // the key) arrives after the first render, which re-reads it too.
  const [selectionVersion, setSelectionVersion] = useState(0);
  const selectedId = useMemo(() => {
    void selectionVersion;
    try {
      return sessionStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  }, [storageKey, selectionVersion]);
  const setSelectedId = useCallback(
    (id: string) => {
      try {
        if (id) sessionStorage.setItem(storageKey, id);
        else sessionStorage.removeItem(storageKey);
      } catch {
        /* storage unavailable: the choice just won't survive a refresh */
      }
      setSelectionVersion((v) => v + 1);
    },
    [storageKey],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load grants on auth
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthed) {
      // The stored choice is kept: it is keyed to the user, and auth is briefly
      // false while a refreshed session is restored. With no grants loaded it
      // opens nothing anyway.
      setGrants([]);
      setActAsUser(null);
      return;
    }
    setIsLoading(true);
    fetchProxyGrants()
      .then(({ given, received }) => {
        // Merge given + received, deduplicating by id
        const all = [...given];
        for (const r of received) {
          if (!all.some((g) => g.id === r.id)) all.push(r);
        }
        setGrants(all);
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }, [isAuthed]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const openable = useMemo(
    () => openableRecords(grants, selfId, selfEmail),
    [grants, selfId, selfEmail],
  );
  const invitations = useMemo(
    () => pendingInvitations(grants, selfId, selfEmail),
    [grants, selfId, selfEmail],
  );
  const invitedByMe = useMemo(
    () => grants.filter((g) => g.ownerUserId === selfId && g.status !== "REVOKED"),
    [grants, selfId],
  );

  const viewed = openable.find((g) => g.ownerUserId === selectedId);
  const activeOwnerId = viewed ? viewed.ownerUserId : selfId;
  const activeOwnerName = viewed ? viewed.ownerName : selfName;
  const isProxyView = activeOwnerId !== selfId;
  const permission = permissionOver(grants, activeOwnerId, selfId, selfEmail) ?? "VIEW";
  const canEdit = permission === "FULL";

  // Every request made from here on must act on the record on screen. Without
  // this the proxy's edits were written to their own record and never reached
  // the person whose record they were looking at.
  useEffect(() => {
    setActAsUser(isProxyView ? activeOwnerId : null);
  }, [isProxyView, activeOwnerId]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const switchTo = useCallback(
    (ownerId: string) => setSelectedId(ownerId === selfId ? "" : ownerId),
    [selfId, setSelectedId],
  );

  const invite = useCallback(
    async (input: ProxyInvite): Promise<CareProxyGrant> => {
      const grant = await apiCreateGrant(
        input.email.trim(),
        input.permission,
        input.message?.trim(),
      );
      setGrants((prev) => [grant, ...prev]);
      return grant;
    },
    [],
  );

  const acceptInvite = useCallback(async (id: string) => {
    const updated = await apiAccept(id);
    setGrants((prev) => prev.map((g) => (g.id === id ? updated : g)));
  }, []);

  const declineInvite = useCallback(async (id: string) => {
    const updated = await apiDecline(id);
    setGrants((prev) => prev.map((g) => (g.id === id ? updated : g)));
  }, []);

  const updatePermission = useCallback(
    async (id: string, perm: ProxyPermission) => {
      const updated = await apiUpdatePermission(id, perm);
      setGrants((prev) => prev.map((g) => (g.id === id ? updated : g)));
    },
    [],
  );

  const revoke = useCallback(async (id: string) => {
    const updated = await apiRevoke(id);
    setGrants((prev) => prev.map((g) => (g.id === id ? updated : g)));
    // If this was the active proxy record, revert to own record
    if (selectedId === updated.ownerUserId) setSelectedId("");
  }, [selectedId, setSelectedId]);

  const resendInvite = useCallback(async (id: string) => {
    const updated = await apiResend(id);
    setGrants((prev) => prev.map((g) => (g.id === id ? updated : g)));
  }, []);

  const value = useMemo<CareProxyContextValue>(
    () => ({
      grants,
      invitedByMe,
      invitations,
      openable,
      isLoading,
      error,
      selfId,
      selfName,
      activeOwnerId,
      activeOwnerName,
      isProxyView,
      permission,
      canEdit,
      switchTo,
      invite,
      acceptInvite,
      declineInvite,
      updatePermission,
      revoke,
      resendInvite,
    }),
    [
      grants, invitedByMe, invitations, openable, isLoading, error,
      selfId, selfName, activeOwnerId, activeOwnerName, isProxyView, permission, canEdit,
      switchTo, invite, acceptInvite, declineInvite, updatePermission, revoke, resendInvite,
    ],
  );

  return <CareProxyContext.Provider value={value}>{children}</CareProxyContext.Provider>;
}

export function useCareProxy(): CareProxyContextValue {
  const ctx = useContext(CareProxyContext);
  if (!ctx) throw new Error("useCareProxy must be used within <CareProxyProvider>");
  return ctx;
}
