/**
 * Care proxy — the access model for Phase 2.
 *
 * A grant is one decision by a record owner about one other person: may they open
 * my record, and may they change anything in it? Two levels, because that is the
 * whole of the decision — `VIEW` (read everything) or `FULL` (read and write, the
 * way a caregiver does).
 *
 * The shape follows the invite lifecycle rather than the finished state. An invite
 * exists *before* the other person is linked to an account (`proxyUserId` is null
 * and `proxyEmail` is where it went); accepting is what creates the access. So the
 * same record answers both "who can open my record" and "who hasn't replied yet".
 *
 * Everything is JSON-serialisable and persisted client-side for now. It maps onto
 * the backend's ProxyGrant table when Django lands — see docs/data-model.md, which
 * keeps proxy grants in their own app because access between two people is not a
 * property of either person's clinical record.
 */

export type ProxyPermission = "VIEW" | "FULL";

/** The two levels, in the order they're offered. Copy states the consequence, not
    the setting: what the person on the other end of it will actually be able to do. */
export const PROXY_PERMISSIONS: { value: ProxyPermission; label: string; hint: string }[] = [
  { value: "VIEW", label: "View only", hint: "They can read the whole record — nothing more." },
  { value: "FULL", label: "Full access", hint: "They can also add and edit records for you." },
];

export function proxyPermissionLabel(permission: ProxyPermission): string {
  return permission === "FULL" ? "Full access" : "View only";
}

export type ProxyGrantStatus = "INVITED" | "ACTIVE" | "DECLINED" | "REVOKED";

export const PROXY_STATUS_LABELS: Record<ProxyGrantStatus, string> = {
  INVITED: "Invite sent",
  ACTIVE: "Active",
  DECLINED: "Declined",
  REVOKED: "Revoked",
};

export interface CareProxyGrant {
  id: string;
  /** The record owner — the account that invited, and the only one that can change
      the permission or revoke it. */
  ownerUserId: string;
  ownerName: string;
  /** The invited account, once it's known: set when they accept, or up front for a
      grant that already links two accounts. */
  proxyUserId: string | null;
  /** Their name, taken from their account on acceptance. */
  proxyName: string;
  /** Where the invite went: an email address, or the username they signed up with. */
  proxyEmail: string;
  permission: ProxyPermission;
  status: ProxyGrantStatus;
  /** The owner's optional note, carried with the invitation. */
  message?: string;
  invitedAt: string; // ISO — when the invite last went out
  acceptedAt?: string; // ISO — set on acceptance; this is the date access was granted
  revokedAt?: string; // ISO
}

/** How to name the invited person: their name if we have it, else where the invite
    went — an accepted grant has a name, a pending one usually only has an address. */
export function grantPersonName(grant: CareProxyGrant): string {
  return grant.proxyName.trim() || grant.proxyEmail;
}

/** True when a grant is addressed to this account — by id where we know it, else by
    the address the invite went to. */
export function isAddressedTo(grant: CareProxyGrant, userId: string, email: string): boolean {
  if (grant.proxyUserId) return grant.proxyUserId === userId;
  return !!email && grant.proxyEmail.trim().toLowerCase() === email.trim().toLowerCase();
}

/**
 * What this account may do in `ownerId`'s record: their own is always FULL, someone
 * else's is whatever an accepted grant says, and null means no access at all. Every
 * page asks this one question, so none of them can invent its own answer.
 */
export function permissionOver(
  grants: CareProxyGrant[],
  ownerId: string,
  userId: string,
  email: string,
): ProxyPermission | null {
  if (ownerId === userId) return "FULL";
  const grant = grants.find(
    (g) => g.ownerUserId === ownerId && g.status === "ACTIVE" && isAddressedTo(g, userId, email),
  );
  return grant ? grant.permission : null;
}

/** Other people's records this account may step into, oldest grant first. */
export function openableRecords(
  grants: CareProxyGrant[],
  userId: string,
  email: string,
): CareProxyGrant[] {
  return grants
    .filter((g) => g.status === "ACTIVE" && isAddressedTo(g, userId, email))
    .sort((a, b) => +new Date(a.acceptedAt ?? a.invitedAt) - +new Date(b.acceptedAt ?? b.invitedAt));
}

/** Invitations addressed to this account that haven't been answered yet. */
export function pendingInvitations(
  grants: CareProxyGrant[],
  userId: string,
  email: string,
): CareProxyGrant[] {
  return grants.filter((g) => g.status === "INVITED" && isAddressedTo(g, userId, email));
}
