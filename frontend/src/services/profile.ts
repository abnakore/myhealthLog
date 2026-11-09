/**
 * Profile & emergency contact API calls.
 * Maps to /api/v1/profile/* backend endpoints.
 */
import { api, buildFormData } from "./api";
import type { HealthProfile, EmergencyContact } from "@/types/health";

// The backend uses snake_case; we map to the frontend camelCase types here.
// The backend HealthProfileReadSerializer returns these fields.
export interface BackendProfile {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  sex: string | null;
  blood_type: string | null;
  genotype: string | null;
  height_cm: number | null;
  weightKg: number | null;        // computed by serializer
  phone: string;
  city: string;
  state: string;
  country: string;
  address: string;
  photoUrl: string | null;
  emergencyContacts: BackendEmergencyContact[];
  created_at: string;
  updated_at: string;
}

export interface BackendEmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  alt_phone: string;
  priority: number;
  language: string;
  notes: string;
}

/** Map backend profile to the frontend HealthProfile shape. */
export function toFrontendProfile(b: BackendProfile): HealthProfile {
  return {
    id: b.id,
    fullName: b.full_name,
    dateOfBirth: b.date_of_birth ?? undefined,
    sex: (b.sex as HealthProfile["sex"]) || undefined,
    bloodType: (b.blood_type as HealthProfile["bloodType"]) || undefined,
    genotype: (b.genotype as HealthProfile["genotype"]) || undefined,
    heightCm: b.height_cm ?? undefined,
    weightKg: b.weightKg ?? undefined,
    phone: b.phone || undefined,
    city: b.city || undefined,
    state: b.state || undefined,
    country: b.country || undefined,
    address: b.address || undefined,
    photoUrl: b.photoUrl ?? undefined,
    emergencyContacts: (b.emergencyContacts ?? []).map(toFrontendContact),
  };
}

function toFrontendContact(b: BackendEmergencyContact): EmergencyContact {
  return {
    id: b.id,
    name: b.name,
    relationship: b.relationship,
    phone: b.phone,
    altPhone: b.alt_phone || undefined,
    priority: b.priority,
    language: b.language || undefined,
    notes: b.notes || undefined,
  };
}

export async function fetchProfile(): Promise<HealthProfile> {
  const res = await api.get<BackendProfile>("/v1/profile/");
  return toFrontendProfile(res.data);
}

export async function updateProfile(patch: Partial<{
  full_name: string;
  date_of_birth: string;
  sex: string;
  blood_type: string;
  genotype: string;
  height_cm: number;
  weightKg: number;
  phone: string;
  city: string;
  state: string;
  country: string;
  address: string;
}>): Promise<HealthProfile> {
  const res = await api.patch<BackendProfile>("/v1/profile/", patch);
  return toFrontendProfile(res.data);
}

export async function uploadPhoto(file: File): Promise<HealthProfile> {
  const fd = buildFormData({ photo: file });
  const res = await api.patch<BackendProfile>("/v1/profile/photo/", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return toFrontendProfile(res.data);
}

export async function removePhoto(): Promise<HealthProfile> {
  const res = await api.delete<BackendProfile>("/v1/profile/photo/");
  return toFrontendProfile(res.data);
}

export async function addEmergencyContact(
  data: Omit<EmergencyContact, "id">,
): Promise<EmergencyContact> {
  const payload = {
    name: data.name,
    relationship: data.relationship ?? "",
    phone: data.phone,
    alt_phone: data.altPhone ?? "",
    priority: data.priority,
    language: data.language ?? "",
    notes: data.notes ?? "",
  };
  const res = await api.post<BackendEmergencyContact>("/v1/profile/contacts/", payload);
  return toFrontendContact(res.data);
}

export async function updateEmergencyContact(
  id: string,
  data: Partial<Omit<EmergencyContact, "id">>,
): Promise<EmergencyContact> {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined)         payload.name = data.name;
  if (data.relationship !== undefined) payload.relationship = data.relationship;
  if (data.phone !== undefined)        payload.phone = data.phone;
  if (data.altPhone !== undefined)     payload.alt_phone = data.altPhone;
  if (data.priority !== undefined)     payload.priority = data.priority;
  if (data.language !== undefined)     payload.language = data.language;
  if (data.notes !== undefined)        payload.notes = data.notes;
  const res = await api.patch<BackendEmergencyContact>(`/v1/profile/contacts/${id}/`, payload);
  return toFrontendContact(res.data);
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  await api.delete(`/v1/profile/contacts/${id}/`);
}
