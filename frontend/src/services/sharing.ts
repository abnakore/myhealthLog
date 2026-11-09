/**
 * Sharing & safety API calls.
 * Maps to /api/v1/sharing/* endpoints.
 */
import { api } from "./api";
import type { CareProvider, EmergencySettings, ShareScope, ProviderAccess, ShareStatus } from "@/types/sharing";
import type { CareProxyGrant, ProxyPermission } from "@/types/proxy";
import type {
  Allergy,
  Appointment,
  Condition,
  HealthDocument,
  Immunization,
  Medication,
  VitalReading,
} from "@/types/health";
import {
  toAllergy,
  toAppointment,
  toCondition,
  toDocument,
  toImmunization,
  toMedication,
  toVital,
} from "./records";

// ---------------------------------------------------------------------------
// Care Providers (share codes)
// ---------------------------------------------------------------------------

interface BackendProvider {
  id: string;
  name: string;
  role: string;
  facility: string;
  scopes: ShareScope[];
  access: string;
  pin_enabled: boolean;
  status: string;
  expires_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
  // Only on create response
  share_code?: string;
}

function toProvider(b: BackendProvider): CareProvider & { _rawCode?: string } {
  return {
    id: b.id,
    name: b.name,
    role: b.role || undefined,
    facility: b.facility || undefined,
    scopes: b.scopes,
    access: b.access as ProviderAccess,
    shareCode: b.share_code ?? "••••••••",   // raw code only on create
    pinEnabled: b.pin_enabled,
    status: b.status as ShareStatus,
    expiresAt: b.expires_at ?? undefined,
    lastAccessedAt: b.last_accessed_at ?? undefined,
    createdAt: b.created_at,
    _rawCode: b.share_code,
  };
}

export interface CreateProviderParams {
  name: string;
  role?: string;
  facility?: string;
  scopes: ShareScope[];
  access: ProviderAccess;
  pin?: string;
  expiresAt?: string;
}

export interface CreateProviderResult {
  provider: CareProvider;
  shareCode: string;
  pinEnabled: boolean;
}

export async function fetchProviders(): Promise<CareProvider[]> {
  const res = await api.get<{ count: number; results: BackendProvider[] }>(
    "/v1/sharing/providers/",
    { params: { page_size: 100 } },
  );
  return res.data.results.map(toProvider);
}

export async function createProvider(
  params: CreateProviderParams,
): Promise<CreateProviderResult> {
  const res = await api.post<BackendProvider & { share_code: string }>("/v1/sharing/providers/", {
    name: params.name,
    role: params.role ?? "",
    facility: params.facility ?? "",
    scopes: params.scopes,
    access: params.access,
    pin: params.pin ?? "",
    expires_at: params.expiresAt ?? null,
  });
  const provider = toProvider(res.data);
  return {
    provider,
    shareCode: res.data.share_code,
    pinEnabled: res.data.pin_enabled,
  };
}

export async function resetProviderPin(id: string, pin: string): Promise<CareProvider> {
  const res = await api.patch<BackendProvider>(`/v1/sharing/providers/${id}/`, { pin });
  return toProvider(res.data);
}

/** Drop the PIN on an existing code — the code alone will open the share. */
export async function removeProviderPin(id: string): Promise<CareProvider> {
  const res = await api.patch<BackendProvider>(`/v1/sharing/providers/${id}/`, { remove_pin: true });
  return toProvider(res.data);
}

export async function revokeProvider(id: string): Promise<CareProvider> {
  const res = await api.post<BackendProvider>(`/v1/sharing/providers/${id}/`);
  return toProvider(res.data);
}

export async function deleteProvider(id: string): Promise<void> {
  await api.delete(`/v1/sharing/providers/${id}/`);
}

// ---------------------------------------------------------------------------
// Emergency Settings
// ---------------------------------------------------------------------------

interface BackendEmergencySettings {
  pin_enabled: boolean;
  show_blood_type: boolean;
  show_allergies: boolean;
  show_medications: boolean;
  show_conditions: boolean;
  show_contacts: boolean;
  show_note: boolean;
  note: string;
  updated_at: string;
  // raw token — only returned on first creation or after regenerate
  token?: string;
}

export function toEmergencySettings(
  b: BackendEmergencySettings,
  rawToken?: string,
): EmergencySettings {
  return {
    token: rawToken ?? b.token ?? "",
    pinEnabled: b.pin_enabled,
    showBloodType: b.show_blood_type,
    showAllergies: b.show_allergies,
    showMedications: b.show_medications,
    showConditions: b.show_conditions,
    showContacts: b.show_contacts,
    showNote: b.show_note,
    note: b.note,
    updatedAt: b.updated_at,
  };
}

export async function fetchEmergencySettings(): Promise<EmergencySettings> {
  const res = await api.get<BackendEmergencySettings>("/v1/sharing/emergency/");
  // token field present only on first creation
  return toEmergencySettings(res.data, res.data.token);
}

export async function updateEmergencySettings(
  patch: Partial<{
    pin_enabled: boolean;
    pin: string;
    show_blood_type: boolean;
    show_allergies: boolean;
    show_medications: boolean;
    show_conditions: boolean;
    show_contacts: boolean;
    show_note: boolean;
    note: string;
  }>,
): Promise<EmergencySettings> {
  const res = await api.patch<BackendEmergencySettings>("/v1/sharing/emergency/", patch);
  return toEmergencySettings(res.data);
}

/** Regenerate token — returns the new raw token + updated settings. */
export async function regenerateEmergencyToken(): Promise<EmergencySettings> {
  const res = await api.post<BackendEmergencySettings & { token: string }>(
    "/v1/sharing/emergency/regenerate/",
  );
  return toEmergencySettings(res.data, res.data.token);
}

// ---------------------------------------------------------------------------
// Care Proxy Grants
// ---------------------------------------------------------------------------

interface BackendProxyGrant {
  id: string;
  owner: string;           // UUID
  owner_name: string;
  proxy_user: string | null;
  proxy_email: string;
  proxy_name: string;
  permission: string;
  status: string;
  message: string;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

function toProxyGrant(b: BackendProxyGrant): CareProxyGrant {
  return {
    id: b.id,
    ownerUserId: b.owner,
    ownerName: b.owner_name,
    proxyUserId: b.proxy_user,
    proxyName: b.proxy_name,
    proxyEmail: b.proxy_email,
    permission: b.permission as ProxyPermission,
    status: b.status as CareProxyGrant["status"],
    message: b.message || undefined,
    invitedAt: b.invited_at,
    acceptedAt: b.accepted_at ?? undefined,
    revokedAt: b.revoked_at ?? undefined,
  };
}

export interface ProxyGrantsResponse {
  given: CareProxyGrant[];
  received: CareProxyGrant[];
}

export async function fetchProxyGrants(): Promise<ProxyGrantsResponse> {
  const res = await api.get<{
    given: BackendProxyGrant[];
    received: BackendProxyGrant[];
  }>("/v1/sharing/proxies/");
  return {
    given: res.data.given.map(toProxyGrant),
    received: res.data.received.map(toProxyGrant),
  };
}

export async function createProxyGrant(
  proxyEmail: string,
  permission: ProxyPermission,
  message?: string,
): Promise<CareProxyGrant> {
  const res = await api.post<BackendProxyGrant>("/v1/sharing/proxies/", {
    proxy_email: proxyEmail,
    permission,
    message: message ?? "",
  });
  return toProxyGrant(res.data);
}

export async function revokeProxyGrant(id: string): Promise<CareProxyGrant> {
  const res = await api.post<BackendProxyGrant>(`/v1/sharing/proxies/${id}/revoke/`);
  return toProxyGrant(res.data);
}

export async function acceptProxyGrant(id: string): Promise<CareProxyGrant> {
  const res = await api.post<BackendProxyGrant>(`/v1/sharing/proxies/${id}/accept/`);
  return toProxyGrant(res.data);
}

export async function declineProxyGrant(id: string): Promise<CareProxyGrant> {
  const res = await api.post<BackendProxyGrant>(`/v1/sharing/proxies/${id}/decline/`);
  return toProxyGrant(res.data);
}

export async function resendProxyInvite(id: string): Promise<CareProxyGrant> {
  const res = await api.post<BackendProxyGrant>(`/v1/sharing/proxies/${id}/resend/`);
  return toProxyGrant(res.data);
}

export async function updateProxyPermission(
  id: string,
  permission: ProxyPermission,
): Promise<CareProxyGrant> {
  const res = await api.patch<BackendProxyGrant>(`/v1/sharing/proxies/${id}/`, { permission });
  return toProxyGrant(res.data);
}

// ---------------------------------------------------------------------------
// Provider Access (unauthenticated endpoints)
// ---------------------------------------------------------------------------

/** The scopes a provider may write to — mirrors the backend's writable list. */
export type ProviderWritableScope =
  | "allergies"
  | "medications"
  | "conditions"
  | "measurements"
  | "appointments"
  | "documents"
  | "immunizations";

/** The record the provider's window shows, in the same shapes the app uses. */
export interface ProviderRecordData {
  profile: Record<string, unknown> | null;
  allergies: Allergy[];
  medications: Medication[];
  conditions: Condition[];
  vitals: VitalReading[];
  appointments: Appointment[];
  documents: HealthDocument[];
  immunizations: Immunization[];
}

function readList<T>(value: unknown, map: (raw: never) => T): T[] {
  return Array.isArray(value) ? (value as never[]).map(map) : [];
}

/** Normalise the backend's scoped record into the app's own record types. */
export function toProviderRecord(raw: Record<string, unknown>): ProviderRecordData {
  return {
    profile: (raw.profile as Record<string, unknown> | undefined) ?? null,
    allergies: readList(raw.allergies, (b) => toAllergy(b as never)),
    medications: readList(raw.medications, (b) => toMedication(b as never)),
    conditions: readList(raw.conditions, (b) => toCondition(b as never)),
    vitals: readList(raw.vitals, (b) => toVital(b as never)),
    appointments: readList(raw.appointments, (b) => toAppointment(b as never)),
    documents: readList(raw.documents, (b) => toDocument(b as never)),
    immunizations: readList(raw.immunizations, (b) => toImmunization(b as never)),
  };
}

/** Map one saved record back into the collection the window is showing. */
export function toProviderItem(scope: ProviderWritableScope, raw: unknown): unknown {
  switch (scope) {
    case "allergies":
      return toAllergy(raw as never);
    case "medications":
      return toMedication(raw as never);
    case "conditions":
      return toCondition(raw as never);
    case "measurements":
      return toVital(raw as never);
    case "appointments":
      return toAppointment(raw as never);
    case "documents":
      return toDocument(raw as never);
    case "immunizations":
      return toImmunization(raw as never);
  }
}

export async function openProviderAccess(
  shareCode: string,
  pin?: string,
): Promise<ProviderAccessResult> {
  const res = await api.post<{
    provider: BackendProvider;
    record: Record<string, unknown>;
  }>("/v1/sharing/provider-access/", { share_code: shareCode, pin: pin ?? "" });
  return {
    provider: toProvider(res.data.provider),
    record: toProviderRecord(res.data.record),
  };
}

export interface ProviderAccessResult {
  provider: CareProvider;
  record: ProviderRecordData;
}

/**
 * Add or change one record inside a granted scope.
 *
 * The provider's code (and PIN, when the share has one) authenticates the call;
 * the backend re-checks the scope before writing, so the window cannot be used
 * to reach a part of the record the owner did not share.
 */
export async function saveProviderRecord(
  shareCode: string,
  scope: ProviderWritableScope,
  action: "create" | "update",
  data: Record<string, unknown>,
  pin?: string,
  id?: string,
): Promise<unknown> {
  const res = await api.post<unknown>("/v1/sharing/provider-access/records/", {
    share_code: shareCode,
    pin: pin ?? "",
    scope,
    action,
    id: action === "update" ? id : null,
    data,
  });
  return res.data;
}

export async function addProviderNote(
  shareCode: string,
  note: string,
  pin?: string,
): Promise<{ detail: string; document_id: string }> {
  const res = await api.post<{ detail: string; document_id: string }>(
    "/v1/sharing/provider-access/note/",
    { share_code: shareCode, note, pin: pin ?? "" },
  );
  return res.data;
}

/**
 * Convert one of the app's record objects into the snake_case payload the
 * backend's write serializers accept. The provider window reuses the same
 * forms and builders as the owner's own pages, so the two can never drift.
 */
export function providerPayload(
  scope: ProviderWritableScope,
  item: unknown,
): Record<string, unknown> {
  switch (scope) {
    case "allergies": {
      const a = item as Allergy;
      return {
        substance: a.substance,
        allergy_type: a.allergyType,
        severity: a.severity,
        reactions: a.reactions ?? [],
        triggers: a.triggers ?? [],
        first_reaction_date: a.firstReactionDate ?? null,
        is_verified: a.isVerified ?? false,
        notes: a.notes ?? "",
        source: a.source ?? "SELF_REPORTED",
        condition_ids: a.conditionIds ?? [],
      };
    }
    case "medications": {
      const m = item as Medication;
      return {
        name: m.name,
        dosage: m.dosage,
        form: m.form ?? "",
        route: m.route ?? "",
        frequency: m.frequency,
        duration: m.duration ?? "",
        start_date: m.startDate,
        end_date: m.endDate ?? null,
        prescriber: m.prescriber ?? "",
        reason: m.reason ?? "",
        notes: m.notes ?? "",
        active: m.active,
        source: m.source ?? "SELF_REPORTED",
        condition_ids: m.conditionIds ?? [],
      };
    }
    case "conditions": {
      const c = item as Condition;
      return {
        name: c.name,
        status: c.status,
        severity: c.severity ?? "",
        onset_date: c.onsetDate ?? null,
        resolved_date: c.resolvedDate ?? null,
        icd10_code: c.icd10Code ?? "",
        diagnosed_by: c.diagnosedBy ?? "",
        notes: c.notes ?? "",
        source: c.source ?? "SELF_REPORTED",
      };
    }
    case "measurements": {
      const v = item as VitalReading;
      return {
        vital_type: v.vitalType,
        value: v.value,
        value2: v.value2 ?? null,
        unit: v.unit,
        measured_at: v.measuredAt,
        context: v.context ?? "",
        label: v.label ?? "",
        notes: v.notes ?? "",
        condition_ids: v.conditionIds ?? [],
      };
    }
    case "appointments": {
      const a = item as Appointment;
      return {
        title: a.title,
        clinician: a.clinician ?? "",
        facility: a.facility ?? "",
        scheduled_for: a.scheduledFor,
        status: a.status,
        reason: a.reason ?? "",
        notes: a.notes ?? "",
        condition_ids: a.conditionIds ?? [],
      };
    }
    case "documents": {
      const d = item as HealthDocument;
      return {
        title: d.title,
        doc_type: d.docType,
        document_date: d.documentDate ?? "",
        notes: d.notes ?? "",
        lab_name: d.labName ?? "",
        imaging_type: d.imagingType ?? "",
        body_area: d.bodyArea ?? "",
        findings: d.findings ?? "",
        provider: d.provider ?? "",
        condition_ids: d.conditionIds ?? [],
      };
    }
    case "immunizations": {
      const im = item as Immunization;
      return {
        vaccine: im.vaccine,
        dose_number: im.doseNumber ?? null,
        administered_on: im.administeredOn,
        next_due: im.nextDue ?? null,
        notes: im.notes ?? "",
        condition_ids: im.conditionIds ?? [],
      };
    }
  }
}
