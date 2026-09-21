/**
 * Sharing & safety — the model behind myHealthLog's three trust features:
 *
 *  • Care providers  — a doctor or lab given *scoped* access to part of the record,
 *    to read, and optionally to fill in details after a visit. Reached by a share
 *    code (and optional PIN), so nothing is exposed beyond what was chosen.
 *  • Circle of trust — the people (usually family) allowed to see the record and act
 *    on the person's behalf, including in an emergency.
 *  • Emergency access — the revocable code on the emergency card, the optional PIN
 *    that gates it, and exactly which details it reveals.
 *
 * All shapes are JSON-serialisable and persisted client-side for now; they map onto
 * the backend's Share / Consent tables when it lands (see docs/data-model.md).
 */

/* ------------------------------------------------------------------ scopes -- */
/* The categories access is granted over — a stable lens across the record, matching
   the record store's collections plus the profile. */

export type ShareScope =
  | "profile"
  | "allergies"
  | "medications"
  | "conditions"
  | "measurements"
  | "appointments"
  | "documents"
  | "immunizations";

export const SHARE_SCOPES: ShareScope[] = [
  "profile",
  "allergies",
  "medications",
  "conditions",
  "measurements",
  "appointments",
  "documents",
  "immunizations",
];

export const SHARE_SCOPE_LABELS: Record<ShareScope, string> = {
  profile: "Profile & basics",
  allergies: "Allergies",
  medications: "Medications",
  conditions: "Conditions",
  measurements: "Measurements",
  appointments: "Appointments",
  documents: "Documents",
  immunizations: "Immunisations",
};

/** A short "Allergies, Medications +2" summary of a scope selection. */
export function summariseScopes(scopes: ShareScope[]): string {
  if (scopes.length === 0) return "Nothing selected";
  if (scopes.length === SHARE_SCOPES.length) return "The whole record";
  const names = scopes.map((s) => SHARE_SCOPE_LABELS[s]);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/* -------------------------------------------------------------- providers -- */

/** What a provider may do within the scopes they're given. */
export type ProviderAccess = "VIEW" | "CONTRIBUTE";

export const PROVIDER_ACCESS: { value: ProviderAccess; label: string; hint: string }[] = [
  { value: "VIEW", label: "View only", hint: "They can read the records you pick — nothing more." },
  {
    value: "CONTRIBUTE",
    label: "View & fill in",
    hint: "They can also add results and notes — for after a visit or a lab test.",
  },
];

export function providerAccessLabel(access: ProviderAccess): string {
  return access === "CONTRIBUTE" ? "View & fill in" : "View only";
}

export type ShareStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED";

export const SHARE_STATUS_LABELS: Record<ShareStatus, string> = {
  PENDING: "Waiting to open",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
};

export interface CareProvider {
  id: string;
  name: string;
  role?: string; // "Endocrinologist", "Laboratory"
  facility?: string;
  scopes: ShareScope[];
  access: ProviderAccess;
  shareCode: string;
  pin?: string; // optional 4-digit gate
  status: ShareStatus;
  createdAt: string; // ISO
  expiresAt?: string; // ISO — optional auto-expiry
  lastAccessedAt?: string; // ISO — set when they first open it (mocked)
}

/* ----------------------------------------------------------- connections -- */

export type ConnectionKind = "APP" | "DEVICE";

export interface ConnectionSource {
  id: string;
  name: string;
  kind: ConnectionKind;
  blurb: string;
  /** The measurements this source would bring into the record. */
  brings: string[];
}

/** The apps and devices myHealthLog can pull readings from. A stand-in for real
    integrations — connecting is mocked, but the shape is what the backend will store. */
export const CONNECTION_CATALOG: ConnectionSource[] = [
  {
    id: "samsung-health",
    name: "Samsung Health",
    kind: "APP",
    blurb: "Steps, heart rate and sleep from your Samsung phone or watch.",
    brings: ["Steps", "Heart rate", "Sleep", "Weight"],
  },
  {
    id: "google-fit",
    name: "Google Fit",
    kind: "APP",
    blurb: "Activity and heart-rate data across your Android devices.",
    brings: ["Steps", "Activity", "Heart rate"],
  },
  {
    id: "apple-health",
    name: "Apple Health",
    kind: "APP",
    blurb: "Everything your iPhone and Apple Watch already track.",
    brings: ["Steps", "Heart rate", "Sleep", "Oxygen (SpO₂)"],
  },
  {
    id: "fitbit",
    name: "Fitbit",
    kind: "APP",
    blurb: "Wearable activity, sleep and heart tracking.",
    brings: ["Steps", "Heart rate", "Sleep"],
  },
  {
    id: "omron-connect",
    name: "Omron blood-pressure monitor",
    kind: "DEVICE",
    blurb: "Send each home reading straight into your measurements.",
    brings: ["Blood pressure", "Pulse"],
  },
  {
    id: "accu-chek",
    name: "Accu-Chek glucose meter",
    kind: "DEVICE",
    blurb: "Log every fasting and post-meal reading automatically.",
    brings: ["Blood sugar"],
  },
  {
    id: "withings-scale",
    name: "Withings scale",
    kind: "DEVICE",
    blurb: "Weight and BMI recorded each time you step on.",
    brings: ["Weight", "BMI"],
  },
];

export function connectionSource(id: string): ConnectionSource | undefined {
  return CONNECTION_CATALOG.find((s) => s.id === id);
}

export const CONNECTION_KIND_LABELS: Record<ConnectionKind, string> = {
  APP: "App",
  DEVICE: "Device",
};

/** A live link to a source. Present only while connected. */
export interface Connection {
  sourceId: string;
  connectedAt: string; // ISO
  lastSync: string; // ISO
}

/* ------------------------------------------------------ emergency access -- */

export type EmergencyToggleKey =
  | "showBloodType"
  | "showAllergies"
  | "showMedications"
  | "showConditions"
  | "showContacts"
  | "showNote";

export interface EmergencySettings {
  token: string; // seeds the QR; revocable by regenerating
  pinEnabled: boolean;
  pin?: string; // 4-digit, set when pinEnabled
  showBloodType: boolean;
  showAllergies: boolean;
  showMedications: boolean;
  showConditions: boolean;
  showContacts: boolean;
  showNote: boolean;
  note: string; // a free line for a responder, shown when showNote and non-empty
  updatedAt: string; // ISO
}

/** The toggles on the Emergency access page, in card order. */
export const EMERGENCY_TOGGLES: { key: EmergencyToggleKey; label: string; hint: string }[] = [
  { key: "showBloodType", label: "Blood type & genotype", hint: "The essentials a responder needs first." },
  { key: "showAllergies", label: "Critical allergies", hint: "Life-threatening reactions only." },
  { key: "showMedications", label: "Current medicines", hint: "What you're taking now." },
  { key: "showConditions", label: "Ongoing conditions", hint: "Active diagnoses on your record." },
  { key: "showContacts", label: "Emergency contact", hint: "Your first contact and their number." },
  { key: "showNote", label: "Personal note", hint: "Anything else a responder should know." },
];

/* ----------------------------------------------------------- generators -- */
/* Human-readable codes with no ambiguous characters (no 0/O, 1/I/L). Deterministic
   only in shape — a real backend mints and signs these. */

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randBlock(len: number): string {
  let out = "";
  for (let i = 0; i < len; i += 1) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

/** A provider share code, e.g. "MHL-7QK2-9F4P". */
export function newShareCode(): string {
  return `MHL-${randBlock(4)}-${randBlock(4)}`;
}

/** An emergency-card token, in the opaque lowercase style of the demo seed. */
export function newEmergencyToken(): string {
  return `eznk-${randBlock(4)}-${randBlock(4)}`.toLowerCase();
}

/** A 4-digit PIN as a string, so leading zeros survive. */
export function newPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
