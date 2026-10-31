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

import type { HealthContext } from "./context";

export type RecordSource = "SELF_REPORTED" | "CLINICIAN" | "IMPORTED";

/**
 * The optional link every clinical record carries to the conditions it relates to.
 *
 * It is optional and plural on purpose: a routine check-up relates to nothing, a
 * pregnancy blood test may relate to nothing at all, Salbutamol relates to Asthma,
 * and Lisinopril relates to both hypertension and heart failure. A record with no
 * link is a complete, valid record — `undefined`, not an empty box to fill in.
 *
 * It holds ids of Conditions already on file. A condition-aware profile reads these
 * links; it never writes a second copy of the record.
 */
export interface ConditionLinked {
  conditionIds?: ID[];
}

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
  /** ICD-10 coding, e.g. "E11.9" — optional, typed in by the person. */
  icd10Code?: string;
  /** Who made the diagnosis, e.g. "Dr. F. Abdullahi". */
  diagnosedBy?: string;
  notes?: string;
  /** A document that confirms the condition — a letter or report. */
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  source?: RecordSource;
}

/* -------------------------------------------------------------- allergies -- */

export type AllergyType = "DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER";
export type AllergySeverity = "MILD" | "MODERATE" | "SEVERE" | "ANAPHYLAXIS";

export interface Allergy extends ConditionLinked {
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

export interface Medication extends ConditionLinked {
  id: ID;
  name: string;
  dosage: string; // "500 mg"
  form?: string; // tablet, syrup, injection — a MEDICATION_FORMS entry or typed in
  route?: string; // oral, IV
  frequency: string; // "Twice daily"
  duration?: string; // how long the course runs, e.g. "7 days"
  startDate: string;
  endDate?: string; // undefined => ongoing
  prescriber?: string;
  reason?: string;
  notes?: string;
  /** An attached document — the prescriber's written note, a pack photo, etc. */
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  active: boolean; // brief: mark active/inactive (defaults from endDate)
  source?: RecordSource;
}

/* ----------------------------------------------------------- appointments -- */

export type AppointmentStatus = "SCHEDULED" | "ATTENDED" | "MISSED" | "CANCELLED";

export interface Appointment extends ConditionLinked {
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

export interface HealthDocument extends ConditionLinked {
  id: ID;
  title: string;
  docType: DocumentType;
  fileName: string;
  fileSize: number; // bytes
  mimeType?: string;
  documentDate?: string;
  uploadedAt: string;
  notes?: string;
  /** The laboratory that produced a lab result, e.g. "Lancet Kano". */
  labName?: string;
  /** Imaging specifics — set when this document is a scan. */
  imagingType?: string; // "X-ray", "MRI", … or typed in
  bodyArea?: string; // "Chest", "Left wrist"
  findings?: string; // the report / radiologist's findings
  provider?: string; // who produced the imaging, e.g. "Aminu Kano Teaching Hospital"
}

/* --------------------------------------------- procedures & immunizations -- */

export interface Procedure extends ConditionLinked {
  id: ID;
  name: string;
  performedOn: string;
  facility?: string;
  clinician?: string;
  outcome?: string;
  notes?: string;
}

export interface Immunization extends ConditionLinked {
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

export interface VitalReading extends ConditionLinked {
  id: ID;
  vitalType: VitalType;
  value: number;
  value2?: number; // diastolic, for blood pressure
  unit: string;
  measuredAt: string;
  context?: string; // "fasting", "post-meal", "sitting, left arm"
  label?: string; // display name for a CUSTOM reading, e.g. "Ketones"
  notes?: string;
  /** An attached document — a photo of the monitor reading, a clinic printout. */
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

/* --------------------------------------------------------- per-person set -- */
/* One person's whole record, grouped. The store keeps these side by side, keyed by
   the account id they belong to, because a care proxy opens someone else's record in
   the very same app (Phase 2) — the collections are per person, not per session. */

export interface RecordCollections {
  allergies: Allergy[];
  medications: Medication[];
  conditions: Condition[];
  appointments: Appointment[];
  documents: HealthDocument[];
  immunizations: Immunization[];
  procedures: Procedure[];
  vitals: VitalReading[];
  /**
   * Condition-aware profiles on file for this person. Stored with the record it
   * belongs to (so a proxy sees their relative's own contexts) but deliberately
   * *separate* from it: a context holds no clinical data of its own beyond the few
   * life-stage facts, and removing one removes a lens, never a record.
   */
  contexts: HealthContext[];
}

/** Everything on file for one person: the profile plus its collections. */
export interface RecordBundle extends RecordCollections {
  profile: HealthProfile;
}

/** Every collection, empty — the starting point for someone with nothing on file. */
export function emptyCollections(): RecordCollections {
  return {
    allergies: [],
    medications: [],
    conditions: [],
    appointments: [],
    documents: [],
    immunizations: [],
    procedures: [],
    vitals: [],
    contexts: [],
  };
}

/** A blank record for an account with nothing on file yet — someone who has just
    been given proxy access before they've entered anything, or a new sign-up. */
export function emptyRecordBundle(ownerId: string, fullName = ""): RecordBundle {
  return { profile: { id: ownerId, fullName, emergencyContacts: [] }, ...emptyCollections() };
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
  SCAN: "Imaging",
  DISCHARGE_SUMMARY: "Discharge summary",
  OTHER: "Other",
};

/** Common medication forms for the picker; "Other" lets a person type their own. */
export const MEDICATION_FORMS: string[] = [
  "Tablet",
  "Capsule",
  "Injection",
  "Syrup",
  "Cream",
  "Ointment",
  "Drops",
  "Inhaler",
  "Patch",
  "Suppository",
];

/** The form option that reveals a free-text input for anything not on the list. */
export const MEDICATION_FORM_OTHER = "Other";

/** Common imaging kinds for the picker; "Other imaging" lets a person type their own. */
export const IMAGING_TYPES: string[] = [
  "X-ray",
  "CT",
  "MRI",
  "Ultrasound",
  "Mammogram",
];

/** The imaging option that reveals a free-text input for anything not on the list. */
export const IMAGING_TYPE_OTHER = "Other imaging";

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
