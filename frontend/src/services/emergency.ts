/**
 * Emergency API calls.
 * Maps to /api/v1/emergency/* endpoints.
 */
import { api } from "./api";

// ---------------------------------------------------------------------------
// AI Dynamic Summary (authenticated)
// ---------------------------------------------------------------------------

export interface AiEmergencyOverview {
  patient_name: string;
  age: number | null;
  gender: string | null;
  blood_type: string | null;
  genotype: string | null;
  overall_triage_status: "stable" | "warning" | "critical";
  ai_paramedic_note: string;
}

export interface AiEmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface AiPrioritizedItem {
  name?: string;
  reaction?: string;
  severity?: string;
  since?: string;
  dose?: string;
  frequency?: string;
  metric?: string;
  value?: string;
  recorded?: string;
  notes?: string;
  title?: string;
  type?: string;
  date?: string;
  [key: string]: string | undefined;
}

export interface AiPrioritizedSection {
  priority_rank: number;
  module_type:
    | "critical_allergies"
    | "active_conditions"
    | "critical_medications"
    | "vital_signs"
    | "critical_documents";
  title: string;
  urgency_level: "critical" | "warning" | "info";
  items: AiPrioritizedItem[];
}

export interface AiDynamicSummary {
  emergency_overview: AiEmergencyOverview;
  core_essentials: {
    emergency_contacts: AiEmergencyContact[];
  };
  ai_prioritized_sections: AiPrioritizedSection[];
}

export async function fetchAiSummary(): Promise<AiDynamicSummary> {
  const res = await api.get<AiDynamicSummary>("/v1/emergency/dynamic-ai-summary/");
  return res.data;
}

export async function invalidateAiSummary(): Promise<void> {
  await api.post("/v1/emergency/dynamic-ai-summary/invalidate/");
}

// ---------------------------------------------------------------------------
// Public Emergency Card (unauthenticated)
// ---------------------------------------------------------------------------

export interface EmergencySummary {
  allergies: Array<{
    substance: string;
    severity: string;
    reactions: string[];
    type: string | null;
  }>;
  conditions: Array<{
    name: string;
    status: string;
    severity: string | null;
    since: string | null;
  }>;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    form: string | null;
  }>;
  vitals: Array<{
    vitalType: string;
    label: string;
    value: string;
    value2: string | null;
    unit: string;
    measuredAt: string | null;
    /** Recent values, oldest first, so the page can judge the trend. */
    values?: number[];
  }>;
  appointments: Array<{
    title: string;
    scheduledFor: string;
    facility: string | null;
    status: string;
  }>;
  /** Out-of-range results the AI read from files on the record. */
  labFindings?: Array<{
    metric: string;
    value: string;
    unit: string;
    status: string;
    referenceRange: string;
    source: string;
    date: string | null;
  }>;
  pregnant?: boolean;
  /** The owner's ranked care focus (pregnancy and conditions; elderly care is
      left out on the server). Empty when conditions are hidden on the card. */
  careFocus?: Array<{ kind: "pregnancy" | "condition"; label: string; rank: number; reason: string }>;
}

export interface StaticEmergencyCard {
  ownerUserId: string;
  name: string;
  dateOfBirth: string | null;
  age: number | null;
  sex: string | null;
  bloodType: string | null;
  genotype: string | null;
  criticalAllergies: Array<{ substance: string; severity: string; reactions: string[] }>;
  medications: Array<{ name: string; dosage: string; frequency: string }>;
  conditions: Array<{ name: string; since: string | null }>;
  contacts: Array<{ name: string; relationship: string; phone: string }>;
  note: string | null;
  /** The full health summary the card's link opens. */
  summary?: EmergencySummary;
  shows: {
    bloodType: boolean;
    allergies: boolean;
    medications: boolean;
    conditions: boolean;
    contacts: boolean;
    note: boolean;
  };
}

export interface PinRequiredResponse {
  pin_required: true;
}

export type EmergencyCardResponse = StaticEmergencyCard | PinRequiredResponse;

export function isPinRequired(r: EmergencyCardResponse): r is PinRequiredResponse {
  return (r as PinRequiredResponse).pin_required === true;
}

/** Fetch the public emergency card by token. Returns the card or { pin_required: true }. */
export async function fetchPublicCard(token: string): Promise<EmergencyCardResponse> {
  // 403 means PIN is required — the response body carries { pin_required: true }
  try {
    const res = await api.get<StaticEmergencyCard>(`/v1/emergency/card/${encodeURIComponent(token)}/`);
    return res.data;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status: number; data: unknown } };
    if (axiosErr?.response?.status === 403) {
      return { pin_required: true };
    }
    throw err;
  }
}

/** Verify the PIN for a PIN-protected emergency card. Returns the full card on success. */
export async function verifyEmergencyPin(
  token: string,
  pin: string,
): Promise<StaticEmergencyCard> {
  const res = await api.post<StaticEmergencyCard>(
    `/v1/emergency/card/${encodeURIComponent(token)}/verify-pin/`,
    { pin },
  );
  return res.data;
}
