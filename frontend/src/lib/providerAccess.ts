/**
 * The care-provider window: the other half of a share code.
 *
 * A care provider never gets an account here. The code the owner hands over is a
 * link to a small, read-only-or-contribute window that opens exactly the scopes the
 * owner ticked and nothing else. The PIN is checked before any of it renders, and
 * every open (and every note they add) is written to the owner's access log, so the
 * owner can always see who used their code and what they did with it.
 *
 * This module is the stand-in for the backend's unauthenticated share endpoint: same
 * input (code + PIN), same output (a filtered view of one record), same rules.
 */
import { PUBLIC_ORIGIN } from "@/config/config";
import { genId } from "@/lib/id";
import { loadJSON, saveJSON, storageKey } from "@/lib/storage";
import { emptyRecordBundle, type HealthDocument, type RecordBundle } from "@/types/health";
import type { CareProvider, ShareScope } from "@/types/sharing";

/* ------------------------------------------------------------------- link -- */

export function providerAccessPath(code: string): string {
  return `/access/${encodeURIComponent(code)}`;
}

/** The link the owner sends. Absolute, because it is opened on another device. */
export function providerAccessUrl(code: string): string {
  const origin = PUBLIC_ORIGIN ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${origin}${providerAccessPath(code)}`;
}

/* --------------------------------------------------------------- storage -- */

const PROVIDERS_KEY = "sharing.providers";
const RECORDS_KEY = "records";
const LOG_KEY = "sharing.providerLog";
const AUTH_KEY = "mhl.auth.user";

interface StoredUser {
  id?: string;
  name?: string;
}

export interface ProviderAccessLogEntry {
  id: string;
  providerId: string;
  providerName: string;
  action: "OPENED" | "ADDED_NOTE";
  detail?: string;
  at: string;
}

export function readProviders(): CareProvider[] {
  return loadJSON<CareProvider[]>(storageKey(PROVIDERS_KEY), []);
}

function writeProviders(next: CareProvider[]): void {
  saveJSON(storageKey(PROVIDERS_KEY), next);
}

/** True when a grant's own expiry has passed, whatever its stored status says. */
export function providerExpired(provider: CareProvider): boolean {
  return Boolean(
    provider.expiresAt && new Date(provider.expiresAt).getTime() < Date.now(),
  );
}

/** A code that has expired can't be opened, even if nobody remembered to revoke it. */
export function providerUsable(provider: CareProvider): boolean {
  if (provider.status === "EXPIRED" || provider.status === "REVOKED") return false;
  return !providerExpired(provider);
}

function normalise(value: string): string {
  return value.trim().toUpperCase();
}

export function findProviderByCode(code: string | undefined | null): CareProvider | null {
  const wanted = normalise(code ?? "");
  if (!wanted) return null;
  const match = readProviders().find((p) => normalise(p.shareCode) === wanted);
  return match && providerUsable(match) ? match : null;
}

export function providerPinMatches(provider: CareProvider, pin: string): boolean {
  if (!provider.pin) return true;
  return provider.pin.trim() === pin.trim();
}

/**
 * The record a code belongs to. Share codes are only ever minted by a record owner
 * (a proxy can't create one), so the record is the one the signed-in owner is on —
 * on this device, the account that created the code.
 */
export function providerOwner(): { id: string; name: string } | null {
  const user = loadJSON<StoredUser | null>(AUTH_KEY, null);
  if (!user?.id) return null;
  const bundle = loadJSON<Record<string, RecordBundle>>(storageKey(RECORDS_KEY), {})[user.id];
  return { id: user.id, name: bundle?.profile?.fullName ?? user.name ?? "this record" };
}

export function readOwnerBundle(ownerId: string): RecordBundle {
  const stored = loadJSON<Record<string, RecordBundle>>(storageKey(RECORDS_KEY), {})[ownerId];
  const base = stored ?? emptyRecordBundle(ownerId);
  // A record saved by an older build may be missing a list; a missing list is empty.
  return {
    profile: base.profile,
    allergies: base.allergies ?? [],
    medications: base.medications ?? [],
    conditions: base.conditions ?? [],
    appointments: base.appointments ?? [],
    documents: base.documents ?? [],
    immunizations: base.immunizations ?? [],
    procedures: base.procedures ?? [],
    vitals: base.vitals ?? [],
    contexts: base.contexts ?? [],
  };
}

/* ------------------------------------------------------------- access log -- */

export function readProviderLog(): ProviderAccessLogEntry[] {
  const log = loadJSON<ProviderAccessLogEntry[]>(storageKey(LOG_KEY), []);
  return Array.isArray(log) ? log : [];
}

function appendLog(entry: ProviderAccessLogEntry): void {
  saveJSON(storageKey(LOG_KEY), [entry, ...readProviderLog()].slice(0, 100));
}

/**
 * Opening the window is a recorded event: the grant stops reading "waiting to open"
 * the first time the provider actually does, and the owner's page names the time.
 */
export function markProviderOpened(provider: CareProvider): void {
  const at = new Date().toISOString();
  writeProviders(
    readProviders().map((p) =>
      p.id === provider.id
        ? { ...p, status: p.status === "PENDING" ? ("ACTIVE" as const) : p.status, lastAccessedAt: at }
        : p,
    ),
  );
  if (provider.lastAccessedAt) return; // one "opened" line per grant first-open
  appendLog({
    id: genId("log"),
    providerId: provider.id,
    providerName: provider.name,
    action: "OPENED",
    at,
  });
}

/**
 * A provider allowed to "fill in" may add a note to the record — and nothing else.
 * It lands as a document on the owner's record, carrying the provider's name on the
 * entry itself, so the record says who wrote it long after the link is revoked.
 * The Documents scope must be granted; a note is a document, not a back door.
 */
export function canProviderAddNote(provider: CareProvider): boolean {
  return provider.access === "CONTRIBUTE" && provider.scopes.includes("documents");
}

export function addProviderNote(provider: CareProvider, ownerId: string, text: string): boolean {
  const clean = text.trim();
  if (!clean || !canProviderAddNote(provider)) return false;
  const records = loadJSON<Record<string, RecordBundle>>(storageKey(RECORDS_KEY), {});
  const base = records[ownerId] ?? emptyRecordBundle(ownerId);
  const at = new Date().toISOString();
  const note: HealthDocument = {
    id: genId("doc"),
    title: `Note from ${provider.name}`,
    docType: "OTHER",
    fileName: "",
    fileSize: 0,
    uploadedAt: at,
    notes: clean,
    provider: provider.facility ?? provider.name,
    provenance: {
      addedBy: provider.name,
      addedById: provider.id,
      addedByRole: "CARE_PROVIDER",
      addedAt: at,
    },
  };
  saveJSON(storageKey(RECORDS_KEY), {
    ...records,
    [ownerId]: { ...base, documents: [note, ...(base.documents ?? [])] },
  });
  appendLog({
    id: genId("log"),
    providerId: provider.id,
    providerName: provider.name,
    action: "ADDED_NOTE",
    detail: clean.length > 120 ? `${clean.slice(0, 117)}…` : clean,
    at,
  });
  return true;
}

/* ---------------------------------------------------------------- labels -- */

/** The scopes a provider may read, in the order a clinician reads them. */
export const PROVIDER_SCOPE_ORDER: ShareScope[] = [
  "profile",
  "allergies",
  "medications",
  "conditions",
  "measurements",
  "appointments",
  "documents",
  "immunizations",
];
