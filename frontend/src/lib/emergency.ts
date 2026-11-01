/**
 * The emergency safety net's logic: the emergency URL, the token check a public
 * reader would call, and the summary compiler behind the emergency view.
 *
 * On the backend this is the unauthenticated endpoint 3.2 names: it takes the token
 * out of the URL, checks it against the owner's *current* token, and returns a
 * compiled summary of only the facts that matter in the first sixty seconds. Until
 * that endpoint exists, `resolveEmergencyToken` does the same job against the app's
 * own persisted state — same input, same output, same rules about what is included —
 * so the view above it is finished work rather than a mock-up of one.
 *
 * Three properties are worth stating plainly, because they are the feature:
 *
 *  • The token belongs to the person, not the app. Each record has its own code, its
 *    own toggles and its own "last updated" — which is why emergency settings are
 *    stored per owner id rather than once.
 *  • Regenerating invalidates the old code by construction. Validation only ever
 *    matches the current token, so nothing has to be swept up afterwards.
 *  • What a responder sees is the owner's decision, section by section. A hidden
 *    section is absent; a revealed-but-empty one says so, because "no severe
 *    allergies recorded" is clinically different from silence.
 */
import { calcAge } from "@/lib/format";
import { PUBLIC_ORIGIN } from "@/config/config";
import { loadJSON, storageKey } from "@/lib/storage";
import {
  emptyRecordBundle,
  isCriticalAllergy,
  SEX_LABELS,
  type AllergySeverity,
  type RecordBundle,
} from "@/types/health";
import { newEmergencyToken, type EmergencySettings } from "@/types/sharing";
import { contextHeadline, contextsOf, findContext } from "@/lib/healthContexts";

/* -------------------------------------------------------------- the link -- */

/** The path an emergency code lives at — public, and deliberately short. */
export function emergencyPath(token: string): string {
  return `/emergency/${encodeURIComponent(token)}`;
}

/**
 * The URL the QR carries. It is read once, on a phone, possibly by a stranger, so it
 * is the absolute link rather than the bare token: scanning it must open the view
 * directly, with no app to install and nothing to type.
 *
 * `VITE_PUBLIC_ORIGIN` matters when the printed card will be scanned on someone
 * else's device — a LAN address or the deployed domain — because the browser's own
 * origin would otherwise point at `localhost`.
 */
export function emergencyUrl(token: string): string {
  // PUBLIC_ORIGIN is the configured public address when there is one; otherwise the
  // origin this page is being served from (and "" under render-to-string, where there
  // is no location to read).
  const origin =
    PUBLIC_ORIGIN ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${origin}${emergencyPath(token)}`;
}

/** The token as it appears in a pasted link, or a short label for the UI. */
export function tokenSuffix(token: string): string {
  return token.slice(-4).toUpperCase();
}

/* --------------------------------------------------------------- settings -- */

/** A person's card settings before they've touched anything: a fresh code, and the
    sections a responder most needs. Off-by-default note, so silence is a choice. */
export function defaultEmergencySettings(): EmergencySettings {
  return {
    token: newEmergencyToken(),
    pinEnabled: false,
    showBloodType: true,
    showAllergies: true,
    showMedications: true,
    showConditions: true,
    showContacts: true,
    showNote: false,
    note: "",
    updatedAt: new Date().toISOString(),
  };
}

/** The card settings for one owner, materialised on first read so every record the
    app can show has a code of its own. */
export function emergencySettingsFor(
  settingsMap: Record<string, EmergencySettings>,
  ownerUserId: string,
): EmergencySettings {
  return settingsMap[ownerUserId] ?? defaultEmergencySettings();
}

/* ----------------------------------------------------------- the summary -- */

export interface EmergencyAllergy {
  substance: string;
  severity: AllergySeverity;
  reactions: string[];
}

export interface EmergencyMedication {
  name: string;
  dosage: string;
  frequency: string;
}

export interface EmergencyCondition {
  name: string;
  since?: string;
}

export interface EmergencyContact {
  name: string;
  relationship?: string;
  phone: string;
}

/** The compiled card: exactly what a responder gets, and nothing else. */
export interface EmergencySummary {
  ownerUserId: string;
  name: string;
  dateOfBirth?: string;
  age: number | null;
  sex?: string;
  bloodType?: string;
  genotype?: string;
  /** Severe and anaphylactic reactions only — the ones that change treatment. */
  criticalAllergies: EmergencyAllergy[];
  /** Active medicines only. */
  medications: EmergencyMedication[];
  /** Ongoing (being-treated) conditions only. */
  conditions: EmergencyCondition[];
  /** Primary contact first. */
  contacts: EmergencyContact[];
  note?: string;
  /**
   * The context the owner has open on their record, if any — "Asthma", or a pregnancy
   * with its dates. It is included only when the owner has already agreed to show their
   * conditions, because that is the section it is derived from. Relevance never widens
   * access: a record that is only relevant to a context stays exactly as hidden as the
   * sharing rules say it is.
   */
  context?: { label: string; detail?: string };
  /** When the record behind this card last changed. */
  lastUpdated: string | null;
  /** Which sections the owner chose to reveal. */
  shows: {
    bloodType: boolean;
    allergies: boolean;
    medications: boolean;
    conditions: boolean;
    contacts: boolean;
    note: boolean;
  };
}

/** Compare ISO timestamps, keeping the most recent — a missing one never wins. */
function mostRecent(dates: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const value of dates) {
    if (!value) continue;
    const time = +new Date(value);
    if (Number.isNaN(time)) continue;
    if (time > bestTime) {
      bestTime = time;
      best = value;
    }
  }
  return best;
}

/**
 * When this record was last touched — the newest date anywhere in it that has already
 * happened. "Last updated" has to mean the record, not the moment the card's settings
 * were fiddled with, so the card's own stamp is folded in by the compiler. Dates in
 * the future are excluded: an appointment next month is not evidence of a change, and
 * telling a responder the record was updated in the future would be worse than
 * telling them nothing.
 */
export function lastRecordUpdate(bundle: RecordBundle, now = Date.now()): string | null {
  const candidates = [
    ...bundle.medications.flatMap((m) => [m.startDate, m.endDate]),
    ...bundle.conditions.flatMap((c) => [c.onsetDate, c.resolvedDate]),
    ...bundle.allergies.map((a) => a.firstReactionDate),
    ...bundle.appointments.map((a) => a.scheduledFor),
    ...bundle.documents.flatMap((d) => [d.uploadedAt, d.documentDate]),
    ...bundle.procedures.map((p) => p.performedOn),
    ...bundle.immunizations.map((i) => i.administeredOn),
    ...bundle.vitals.map((v) => v.measuredAt),
  ];
  return mostRecent(candidates.filter((d) => d && +new Date(d) <= now));
}

/**
 * Compile the card. This is the "first sixty seconds" logic: the record is filtered
 * down to what treatment decisions actually turn on — severe allergies, current
 * medicines, ongoing conditions, one phone number — and then filtered again by what
 * the owner agreed to share.
 */
export function compileEmergencySummary(
  bundle: RecordBundle,
  settings: EmergencySettings,
  ownerUserId: string,
  context?: { label: string; detail?: string },
): EmergencySummary {
  const profile = bundle.profile;
  const contacts = [...profile.emergencyContacts]
    .filter((c) => c.phone.trim().length > 0)
    .sort((a, b) => a.priority - b.priority)
    .map((c) => ({ name: c.name, relationship: c.relationship, phone: c.phone }));
  const note = settings.showNote ? settings.note.trim() : "";

  return {
    ownerUserId,
    name: profile.fullName,
    dateOfBirth: profile.dateOfBirth,
    age: calcAge(profile.dateOfBirth),
    sex: profile.sex ? SEX_LABELS[profile.sex] : undefined,
    bloodType: profile.bloodType,
    genotype: profile.genotype,
    criticalAllergies: bundle.allergies
      .filter((a) => isCriticalAllergy(a.severity))
      .map((a) => ({
        substance: a.substance,
        severity: a.severity,
        reactions: a.reactions ?? [],
      })),
    medications: bundle.medications
      .filter((m) => m.active)
      .map((m) => ({ name: m.name, dosage: m.dosage, frequency: m.frequency })),
    conditions: bundle.conditions
      .filter((c) => c.status === "ACTIVE")
      .map((c) => ({ name: c.name, since: c.onsetDate })),
    contacts,
    note: note.length > 0 ? note : undefined,
    // Only ever beside the conditions it comes from — never a section of its own.
    context: settings.showConditions ? context : undefined,
    lastUpdated: mostRecent([lastRecordUpdate(bundle), settings.updatedAt]),
    shows: {
      bloodType: settings.showBloodType,
      allergies: settings.showAllergies,
      medications: settings.showMedications,
      conditions: settings.showConditions,
      contacts: settings.showContacts,
      note: settings.showNote,
    },
  };
}

/* -------------------------------------------------------- the public call -- */

export interface EmergencyResolution {
  summary: EmergencySummary;
  /** True when the owner set a PIN: the view asks for it before revealing anything. */
  pinRequired: boolean;
}

/** The persisted slices this reads — the same keys the stores write. */
function readEmergencyState(): {
  settings: Record<string, EmergencySettings>;
  bundles: Record<string, RecordBundle>;
  /** Which profile each record had open — the lens, keyed by owner. */
  active: Record<string, string>;
} {
  return {
    settings: loadJSON<Record<string, EmergencySettings>>(storageKey("sharing.emergency"), {}),
    bundles: loadJSON<Record<string, RecordBundle>>(storageKey("records"), {}),
    active: loadJSON<Record<string, string>>(storageKey("contexts.active"), {}),
  };
}

/**
 * Validate a code and compile its card — the public endpoint in one function.
 *
 * Returns null for anything that isn't a live code: an empty or missing token, a
 * code that was regenerated away, a token someone made up. The caller shows the same
 * "this code isn't valid" state for all of them, because that distinction is useful
 * to an attacker and to nobody else.
 */
export function resolveEmergencyToken(code: string | undefined | null): EmergencyResolution | null {
  const wanted = (code ?? "").trim().toLowerCase();
  if (wanted.length === 0) return null;

  const { settings, bundles, active } = readEmergencyState();
  const ownerUserId = Object.keys(settings).find(
    (id) => settings[id]?.token?.trim().toLowerCase() === wanted,
  );
  if (!ownerUserId) return null;

  const ownerSettings = settings[ownerUserId];
  const ownerBundle = bundles[ownerUserId] ?? emptyRecordBundle(ownerUserId);

  return {
    summary: compileEmergencySummary(
      ownerBundle,
      ownerSettings,
      ownerUserId,
      contextHeadlineFor(ownerBundle, active[ownerUserId]),
    ),
    pinRequired: ownerSettings.pinEnabled && Boolean(ownerSettings.pin?.trim()),
  };
}

/**
 * The label for the profile the owner has open, read from the record's own contexts.
 * A profile that has since been removed, or an id left behind by an older session,
 * resolves to nothing — the card then simply reads the way it always did.
 */
function contextHeadlineFor(
  bundle: RecordBundle,
  activeId: string | undefined,
): { label: string; detail?: string } | undefined {
  const ctx = findContext(contextsOf(bundle), activeId);
  if (!ctx) return undefined;
  return contextHeadline(ctx, bundle.conditions);
}

/**
 * Check a PIN against the code's owner. On the backend this is a server-side check
 * (the PIN never travels to the client); here it stays a local comparison so the
 * demo needs no endpoint, which is the only part of this file that isn't already
 * shaped like the real thing.
 */
export function emergencyPinMatches(code: string | undefined | null, pin: string): boolean {
  const wanted = (code ?? "").trim().toLowerCase();
  const attempt = pin.trim();
  if (wanted.length === 0 || attempt.length === 0) return false;
  const { settings } = readEmergencyState();
  const owner = Object.values(settings).find((s) => s?.token?.trim().toLowerCase() === wanted);
  return Boolean(owner?.pinEnabled && owner.pin?.trim() === attempt);
}
