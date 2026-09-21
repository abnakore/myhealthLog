/**
 * The health record types. Field names and enums track the backend design in
 * docs/data-model.md (User is separate from HealthProfile; ClinicalRecord is the
 * abstract base; FHIR coding fields exist from day one).
 *
 * A few fields are frontend conveniences the brief's forms ask for but the sketch
 * folds elsewhere (allergy `triggers`/`firstReactionDate`, profile `city`/`weightKg`).
 * They're marked below; the API layer can map or drop them when the backend lands.
 */

export type ID = string;

export type RecordSource = "SELF_REPORTED" | "CLINICIAN" | "IMPORTED";

/* ---------------------------------------------------------------- profile -- */

export type Sex = "MALE" | "FEMALE" | "OTHER";
export type BloodType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
export type Genotype = "AA" | "AS" | "AC" | "SS" | "SC";

export interface EmergencyContact {
  id: ID;
  name: string;
  relationship: string;
  phone: string;
  altPhone?: string;
  priority: number;
  language?: string; // emergency language / preferences, if applicable
  notes?: string; // emergency notes for a first responder
}

export interface HealthProfile {
  id: ID;
  fullName: string;
  dateOfBirth?: string; // ISO date
  sex?: Sex;
  bloodType?: BloodType;
  genotype?: Genotype;
  heightCm?: number;
  weightKg?: number; // convenience: latest weight (backend keeps it as a VitalReading)
  phone?: string;
  city?: string; // convenience: for the "34 · Kano" identity line
  country?: string;
  state?: string; // state / region, e.g. "Kano State"
  address?: string; // street address, e.g. "12 Ibrahim Crescent, Ungogo"
  photoUrl?: string;
  emergencyContacts: EmergencyContact[];
}

/* ------------------------------------------------------------- conditions -- */

export type ConditionStatus = "ACTIVE" | "RESOLVED" | "IN_REMISSION";
export type ClinicalSeverity = "MILD" | "MODERATE" | "SEVERE";

export interface Condition {
  id: ID;
  name: string;
  status: ConditionStatus;
  severity?: ClinicalSeverity;
  onsetDate?: string;
  resolvedDate?: string;
  notes?: string;
  source?: RecordSource;
}

/* -------------------------------------------------------------- allergies -- */

export type AllergyType = "DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER";
export type AllergySeverity = "MILD" | "MODERATE" | "SEVERE" | "ANAPHYLAXIS";

export interface Allergy {
  id: ID;
  substance: string;
  allergyType: AllergyType;
  severity: AllergySeverity;
  reactions?: string[]; // convenience: tag input (backend `reaction` text)
  triggers?: string[]; // convenience: tag input (backend folds into notes)
  firstReactionDate?: string; // convenience
  isVerified?: boolean;
  notes?: string;
  source?: RecordSource;
}

/* ------------------------------------------------------------ medications -- */

export interface Medication {
  id: ID;
  name: string;
  dosage: string; // "500 mg"
  form?: string; // tablet, syrup, injection
  route?: string; // oral, IV
  frequency: string; // "Twice daily"
  startDate: string;
  endDate?: string; // undefined => ongoing
  prescriber?: string;
  reason?: string;
  notes?: string;
  active: boolean; // brief: mark active/inactive (defaults from endDate)
  source?: RecordSource;
}

/* ----------------------------------------------------------- appointments -- */

export type AppointmentStatus = "SCHEDULED" | "ATTENDED" | "MISSED" | "CANCELLED";

export interface Appointment {
  id: ID;
  title: string;
  clinician?: string;
  facility?: string;
  scheduledFor: string; // ISO datetime
  status: AppointmentStatus;
  reason?: string;
  notes?: string;
}

/* -------------------------------------------------------------- documents -- */

export type DocumentType =
  | "LAB_RESULT"
  | "PRESCRIPTION"
  | "SCAN"
  | "DISCHARGE_SUMMARY"
  | "OTHER";

export interface HealthDocument {
  id: ID;
  title: string;
  docType: DocumentType;
  fileName: string;
  fileSize: number; // bytes
  mimeType?: string;
  documentDate?: string;
  uploadedAt: string;
}

/* --------------------------------------------- procedures & immunizations -- */

export interface Procedure {
  id: ID;
  name: string;
  performedOn: string;
  facility?: string;
  clinician?: string;
  outcome?: string;
  notes?: string;
}

export interface Immunization {
  id: ID;
  vaccine: string;
  doseNumber?: number;
  administeredOn: string;
  nextDue?: string;
  notes?: string;
}

/* ----------------------------------------------------------------- vitals -- */

export type VitalType =
  | "BLOOD_PRESSURE"
  | "PULSE"
  | "RESPIRATORY_RATE"
  | "TEMPERATURE"
  | "SPO2"
  | "BLOOD_GLUCOSE"
  | "WEIGHT"
  | "HEIGHT"
  | "BMI"
  | "PAIN"
  | "PEAK_FLOW"
  | "CUSTOM";

export interface VitalReading {
  id: ID;
  vitalType: VitalType;
  value: number;
  value2?: number; // diastolic, for blood pressure
  unit: string;
  measuredAt: string;
  context?: string; // "fasting", "post-meal", "sitting, left arm"
  label?: string; // display name for a CUSTOM reading, e.g. "Ketones"
}

/* ------------------------------------------------------- display metadata -- */
/* Option lists (for selects) and human labels (for display), in one place so a
   form and a list never disagree on wording. */

export const BLOOD_TYPES: BloodType[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const GENOTYPES: Genotype[] = ["AA", "AS", "AC", "SS", "SC"];

export const SEX_LABELS: Record<Sex, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

export const ALLERGY_TYPE_LABELS: Record<AllergyType, string> = {
  DRUG: "Drug",
  FOOD: "Food",
  ENVIRONMENTAL: "Environmental",
  OTHER: "Other",
};

export const ALLERGY_SEVERITY_LABELS: Record<AllergySeverity, string> = {
  MILD: "Mild",
  MODERATE: "Moderate",
  SEVERE: "Severe",
  ANAPHYLAXIS: "Anaphylaxis",
};

export const CONDITION_STATUS_LABELS: Record<ConditionStatus, string> = {
  ACTIVE: "Being treated",
  RESOLVED: "Resolved",
  IN_REMISSION: "Settled",
};

export const SEVERITY_LABELS: Record<ClinicalSeverity, string> = {
  MILD: "Mild",
  MODERATE: "Moderate",
  SEVERE: "Severe",
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: "Scheduled",
  ATTENDED: "Attended",
  MISSED: "Missed",
  CANCELLED: "Cancelled",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  LAB_RESULT: "Lab result",
  PRESCRIPTION: "Prescription",
  SCAN: "Scan / imaging",
  DISCHARGE_SUMMARY: "Discharge summary",
  OTHER: "Other",
};

// Ordered clinically — the vitals a clinician takes together lead, then body
// metrics, then symptom/other. Selects and grouped lists follow this key order.
export const VITAL_LABELS: Record<VitalType, string> = {
  BLOOD_PRESSURE: "Blood pressure",
  PULSE: "Heart rate",
  RESPIRATORY_RATE: "Respiratory rate",
  TEMPERATURE: "Temperature",
  SPO2: "Oxygen (SpO₂)",
  BLOOD_GLUCOSE: "Blood sugar",
  WEIGHT: "Weight",
  HEIGHT: "Height",
  BMI: "BMI",
  PAIN: "Pain level",
  PEAK_FLOW: "Peak flow",
  CUSTOM: "Other measurement",
};

export interface VitalMeta {
  /** Default unit; for CUSTOM it's empty and the user types their own. */
  unit: string;
  /** A paired reading (systolic/diastolic). */
  dual?: boolean;
  /** Labels for the two inputs when `dual`. */
  valueLabel?: string;
  value2Label?: string;
  /** Input step; also hints decimals. */
  step?: number;
  /** Decimals to show. */
  decimals?: number;
  /** A typical healthy band for the primary value — drives a gentle in/out-of-range tag. */
  range?: [number, number];
}

// Units and normal bands are general adult references for a friendly at-a-glance
// cue, not clinical thresholds. The range tag always rides with the number and a
// word — it never stands in for medical advice.
export const VITAL_META: Record<VitalType, VitalMeta> = {
  BLOOD_PRESSURE: { unit: "mmHg", dual: true, valueLabel: "Systolic", value2Label: "Diastolic", step: 1, range: [90, 130] },
  PULSE: { unit: "bpm", step: 1, range: [60, 100] },
  RESPIRATORY_RATE: { unit: "breaths/min", step: 1, range: [12, 20] },
  TEMPERATURE: { unit: "°C", step: 0.1, decimals: 1, range: [36.1, 37.5] },
  SPO2: { unit: "%", step: 1, range: [95, 100] },
  BLOOD_GLUCOSE: { unit: "mmol/L", step: 0.1, decimals: 1, range: [4, 7.8] },
  WEIGHT: { unit: "kg", step: 0.1, decimals: 1 },
  HEIGHT: { unit: "cm", step: 0.1, decimals: 1 },
  BMI: { unit: "kg/m²", step: 0.1, decimals: 1, range: [18.5, 24.9] },
  PAIN: { unit: "/10", step: 1 },
  PEAK_FLOW: { unit: "L/min", step: 1 },
  CUSTOM: { unit: "" },
};

/** BMI from height (cm) and weight (kg), to one decimal; undefined if either is missing. */
export function bmiFrom(heightCm?: number, weightKg?: number): number | undefined {
  if (!heightCm || !weightKg) return undefined;
  const m = heightCm / 100;
  if (m <= 0) return undefined;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** A reading's display name — the label for CUSTOM, otherwise the type's label. */
export function vitalName(v: Pick<VitalReading, "vitalType" | "label">): string {
  if (v.vitalType === "CUSTOM") return v.label?.trim() || "Measurement";
  return VITAL_LABELS[v.vitalType];
}

// Trim to the type's precision without forcing trailing zeros: 72 → "72", 6.2 → "6.2".
function trimNum(n: number, dp: number): string {
  return dp > 0 ? String(Number(n.toFixed(dp))) : String(Math.round(n));
}

/** "128/84 mmHg", "6.2 mmol/L", "37 °C" — the value with its unit, ready to show. */
export function formatVitalValue(
  v: Pick<VitalReading, "vitalType" | "value" | "value2" | "unit">,
): string {
  const meta = VITAL_META[v.vitalType];
  const dp = meta?.decimals ?? 0;
  const main = v.value2 != null ? `${v.value}/${v.value2}` : trimNum(v.value, dp);
  const unit = v.unit || meta?.unit || "";
  return unit ? `${main} ${unit}` : main;
}

export type VitalStatus = "low" | "normal" | "high";

/** Where the primary value sits against the type's normal band, or null if none. */
export function vitalStatus(v: Pick<VitalReading, "vitalType" | "value">): VitalStatus | null {
  const range = VITAL_META[v.vitalType]?.range;
  if (!range) return null;
  if (v.value < range[0]) return "low";
  if (v.value > range[1]) return "high";
  return "normal";
}

/** True for a severity that must surface on the emergency summary. */
export function isCriticalAllergy(severity: AllergySeverity): boolean {
  return severity === "SEVERE" || severity === "ANAPHYLAXIS";
}
