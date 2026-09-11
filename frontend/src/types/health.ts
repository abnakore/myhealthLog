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
  | "BLOOD_GLUCOSE"
  | "WEIGHT"
  | "TEMPERATURE"
  | "PULSE"
  | "SPO2";

export interface VitalReading {
  id: ID;
  vitalType: VitalType;
  value: number;
  value2?: number; // diastolic, for blood pressure
  unit: string;
  measuredAt: string;
  context?: string; // "fasting", "post-meal", "sitting, left arm"
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

export const VITAL_LABELS: Record<VitalType, string> = {
  BLOOD_PRESSURE: "Blood pressure",
  BLOOD_GLUCOSE: "Blood sugar",
  WEIGHT: "Weight",
  TEMPERATURE: "Temperature",
  PULSE: "Pulse",
  SPO2: "Oxygen (SpO₂)",
};

/** True for a severity that must surface on the emergency summary. */
export function isCriticalAllergy(severity: AllergySeverity): boolean {
  return severity === "SEVERE" || severity === "ANAPHYLAXIS";
}
