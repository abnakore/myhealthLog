/**
 * The care-proxy layer: who may open whose record, and whose record the app is
 * showing right now.
 *
 * Those two belong together. A permission with no context is abstract, and a context
 * with no permission is a hole — so one store answers both, and every page asks it
 * rather than assuming the signed-in user is the record owner. <RecordsProvider>
 * reads the active id from here, which is what lets a proxy's Medications page be
 * someone else's medications without that page knowing anything about proxies.
 *
 * Seeded from the demo grants and mirrored to localStorage, so an invite you send
 * (or accept) survives a refresh. When the DRF backend lands, these mutators become
 * the API calls and the seed goes away; the component API (useCareProxy) stays.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthContext";
import { demoProxyGrants } from "@/data/mock";
import { genId } from "@/lib/id";
import { usePersistentState } from "@/lib/storage";
import {
  openableRecords,
  pendingInvitations,
  permissionOver,
  type CareProxyGrant,
  type ProxyPermission,
} from "@/types/proxy";

/** What the invite form collects: their email or username, the level, and a note. */
export interface ProxyInvite {
  /** Where the invite goes — an address, or the username they signed up with. */
  email: string;
  permission: ProxyPermission;
  message?: string;
}

interface CareProxyContextValue {
  /** Every grant this account is part of — owned, held, or waiting to be answered. */
  grants: CareProxyGrant[];
  /** People the signed-in user has invited to their own record (revoked ones aside). */
  invitedByMe: CareProxyGrant[];
  /** Invitations addressed to the signed-in user that they haven't answered. */
  invitations: CareProxyGrant[];
  /** Other people's records the signed-in user may step into. */
  openable: CareProxyGrant[];

  selfId: string;
  selfName: string;
  /** Whose record every page is showing — the signed-in user, or a proxy's owner. */
  activeOwnerId: string;
  activeOwnerName: string;
  isProxyView: boolean;
  /** What the signed-in user may do in that record. */
  permission: ProxyPermission;
  /** False for a view-only proxy: write controls hide, the record still reads. */
  canEdit: boolean;

  switchTo: (ownerId: string) => void;
  invite: (invite: ProxyInvite) => CareProxyGrant;
  acceptInvite: (id: string) => void;
  declineInvite: (id: string) => void;
  updatePermission: (id: string, permission: ProxyPermission) => void;
  revoke: (id: string) => void;
  resendInvite: (id: string) => void;
}

const CareProxyContext = createContext<CareProxyContextValue | null>(null);

export function CareProxyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const selfId = user?.id ?? "";
  const selfName = user?.name ?? "You";
  const selfEmail = user?.email ?? "";

  const [grants, setGrants] = usePersistentState<CareProxyGrant[]>(
    "careProxy.grants",
    () => demoProxyGrants,
  );
  /** "" is the person's own record — the default, and the only state a new account is ever in. */
  const [selectedId, setSelectedId] = usePersistentState<string>("careProxy.viewing", () => "");

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

  // Only a record still open can be the active one: revoke or decline a grant and the
  // app falls back to the person's own record rather than leaving a stale context on
  // screen. Revoked grants stay in the list — access ended, the history didn't.
  const viewed = openable.find((g) => g.ownerUserId === selectedId);
  const activeOwnerId = viewed ? viewed.ownerUserId : selfId;
  const activeOwnerName = viewed ? viewed.ownerName : selfName;
  const isProxyView = activeOwnerId !== selfId;
  // One source of truth for the answer, so no page can compute a different one.
  const permission = permissionOver(grants, activeOwnerId, selfId, selfEmail) ?? "VIEW";
  const canEdit = permission === "FULL";

  const switchTo = useCallback(
    (ownerId: string) => setSelectedId(ownerId === selfId ? "" : ownerId),
    [selfId, setSelectedId],
  );

  const invite = useCallback(
    (input: ProxyInvite) => {
      const grant: CareProxyGrant = {
        id: genId("proxy"),
        ownerUserId: selfId,
        ownerName: selfName,
        // Not linked to an account yet — accepting is what sets this.
        proxyUserId: null,
        proxyName: "",
        proxyEmail: input.email.trim(),
        permission: input.permission,
        status: "INVITED",
        message: input.message?.trim() || undefined,
        invitedAt: new Date().toISOString(),
      };
      setGrants((prev) => [grant, ...prev]);
      return grant;
    },
    [selfId, selfName, setGrants],
  );

  const acceptInvite = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      setGrants((prev) =>
        prev.map((g) =>
          g.id === id
            ? {
                ...g,
                status: "ACTIVE" as const,
                // The link between the two accounts is the grant's whole point.
                proxyUserId: g.proxyUserId ?? selfId,
                proxyName: g.proxyName.trim() || selfName,
                acceptedAt: now,
              }
            : g,
        ),
      );
    },
    [selfId, selfName, setGrants],
  );

  const declineInvite = useCallback(
    (id: string) => {
      setGrants((prev) =>
        prev.map((g) => (g.id === id ? { ...g, status: "DECLINED" as const } : g)),
      );
    },
    [setGrants],
  );

  const updatePermission = useCallback(
    (id: string, permission: ProxyPermission) => {
      setGrants((prev) => prev.map((g) => (g.id === id ? { ...g, permission } : g)));
    },
    [setGrants],
  );

  const revoke = useCallback(
    (id: string) => {
      setGrants((prev) =>
        prev.map((g) =>
          g.id === id ? { ...g, status: "REVOKED" as const, revokedAt: new Date().toISOString() } : g,
        ),
      );
    },
    [setGrants],
  );

  // A resend re-stamps the send date, so the row reads "just now" — the honest signal
  // that something happened, without a toast for a one-line action.
  const resendInvite = useCallback(
    (id: string) => {
      setGrants((prev) =>
        prev.map((g) => (g.id === id ? { ...g, invitedAt: new Date().toISOString() } : g)),
      );
    },
    [setGrants],
  );

  const value = useMemo<CareProxyContextValue>(
    () => ({
      grants,
      invitedByMe,
      invitations,
      openable,
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
      grants,
      invitedByMe,
      invitations,
      openable,
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
    ],
  );

  return <CareProxyContext.Provider value={value}>{children}</CareProxyContext.Provider>;
}

export function useCareProxy(): CareProxyContextValue {
  const ctx = useContext(CareProxyContext);
  if (!ctx) throw new Error("useCareProxy must be used within <CareProxyProvider>");
  return ctx;
}
