/**
 * Form models for every writable record. Each type has: a Draft (string-based, what
 * the controlled inputs hold), an empty draft, a record→draft seeder (for editing), a
 * validator (returns only the fields in error), and a draft→record builder. The Add
 * page, the per-category edit modals, and the onboarding steps all build on these, so
 * a field is defined once and never drifts between "add" and "edit".
 */
import { genId } from "@/lib/id";
import type {
  Allergy,
  AllergySeverity,
  AllergyType,
  Appointment,
  AppointmentStatus,
  BloodType,
  ClinicalSeverity,
  Condition,
  ConditionStatus,
  DocumentType,
  EmergencyContact,
  HealthDocument,
  HealthProfile,
  Immunization,
  Medication,
  Sex,
} from "@/types/health";

export type FieldErrors = Record<string, string>;

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/* --------------------------------------------------------------- allergy -- */

export interface AllergyDraft {
  substance: string;
  allergyType: AllergyType;
  severity: AllergySeverity;
  firstReactionDate: string;
  reactions: string[];
  triggers: string[];
  notes: string;
  isVerified: boolean;
}

export const emptyAllergyDraft = (): AllergyDraft => ({
  substance: "",
  allergyType: "DRUG",
  severity: "MILD",
  firstReactionDate: "",
  reactions: [],
  triggers: [],
  notes: "",
  isVerified: false,
});

export const allergyToDraft = (a: Allergy): AllergyDraft => ({
  substance: a.substance,
  allergyType: a.allergyType,
  severity: a.severity,
  firstReactionDate: a.firstReactionDate ?? "",
  reactions: a.reactions ?? [],
  triggers: a.triggers ?? [],
  notes: a.notes ?? "",
  isVerified: a.isVerified ?? false,
});

export function validateAllergy(d: AllergyDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.substance.trim()) e.substance = "Enter what you're allergic to.";
  return e;
}

export function allergyFromDraft(d: AllergyDraft, base?: Allergy): Allergy {
  return {
    id: base?.id ?? genId("al"),
    substance: d.substance.trim(),
    allergyType: d.allergyType,
    severity: d.severity,
    reactions: d.reactions,
    triggers: d.triggers,
    firstReactionDate: d.firstReactionDate || undefined,
    isVerified: d.isVerified,
    notes: d.notes.trim() || undefined,
    source: base?.source ?? "SELF_REPORTED",
  };
}

/* ------------------------------------------------------------ medication -- */

export interface MedicationDraft {
  name: string;
  dosage: string;
  form: string;
  frequency: string;
  startDate: string;
  endDate: string;
  prescriber: string;
  reason: string;
  notes: string;
  active: boolean;
}

export const emptyMedicationDraft = (): MedicationDraft => ({
  name: "",
  dosage: "",
  form: "",
  frequency: "",
  startDate: "",
  endDate: "",
  prescriber: "",
  reason: "",
  notes: "",
  active: true,
});

export const medicationToDraft = (m: Medication): MedicationDraft => ({
  name: m.name,
  dosage: m.dosage,
  form: m.form ?? "",
  frequency: m.frequency,
  startDate: m.startDate,
  endDate: m.endDate ?? "",
  prescriber: m.prescriber ?? "",
  reason: m.reason ?? "",
  notes: m.notes ?? "",
  active: m.active,
});

export function validateMedication(d: MedicationDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.name.trim()) e.name = "Enter the medication name.";
  if (!d.startDate) e.startDate = "When did you start it?";
  if (d.endDate && d.startDate && d.endDate < d.startDate) {
    e.endDate = "The end date can't be before the start.";
  }
  return e;
}

export function medicationFromDraft(d: MedicationDraft, base?: Medication): Medication {
  return {
    id: base?.id ?? genId("md"),
    name: d.name.trim(),
    dosage: d.dosage.trim(),
    form: d.form.trim() || undefined,
    frequency: d.frequency.trim(),
    startDate: d.startDate,
    endDate: d.endDate || undefined,
    prescriber: d.prescriber.trim() || undefined,
    reason: d.reason.trim() || undefined,
    notes: d.notes.trim() || undefined,
    active: d.active,
    source: base?.source ?? "SELF_REPORTED",
  };
}

/* ------------------------------------------------------------- condition -- */

export interface ConditionDraft {
  name: string;
  status: ConditionStatus;
  severity: ClinicalSeverity | "";
  onsetDate: string;
  resolvedDate: string;
  notes: string;
}

export const emptyConditionDraft = (): ConditionDraft => ({
  name: "",
  status: "ACTIVE",
  severity: "",
  onsetDate: "",
  resolvedDate: "",
  notes: "",
});

export const conditionToDraft = (c: Condition): ConditionDraft => ({
  name: c.name,
  status: c.status,
  severity: c.severity ?? "",
  onsetDate: c.onsetDate ?? "",
  resolvedDate: c.resolvedDate ?? "",
  notes: c.notes ?? "",
});

export function validateCondition(d: ConditionDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.name.trim()) e.name = "Enter the condition name.";
  return e;
}

export function conditionFromDraft(d: ConditionDraft, base?: Condition): Condition {
  return {
    id: base?.id ?? genId("cn"),
    name: d.name.trim(),
    status: d.status,
    severity: d.severity || undefined,
    onsetDate: d.onsetDate || undefined,
    resolvedDate: d.status === "RESOLVED" ? d.resolvedDate || undefined : undefined,
    notes: d.notes.trim() || undefined,
    source: base?.source ?? "SELF_REPORTED",
  };
}

/* ----------------------------------------------------------- appointment -- */

export interface AppointmentDraft {
  title: string;
  clinician: string;
  facility: string;
  scheduledFor: string; // datetime-local
  status: AppointmentStatus;
  reason: string;
  notes: string;
}

export const emptyAppointmentDraft = (): AppointmentDraft => ({
  title: "",
  clinician: "",
  facility: "",
  scheduledFor: "",
  status: "SCHEDULED",
  reason: "",
  notes: "",
});

export const appointmentToDraft = (a: Appointment): AppointmentDraft => ({
  title: a.title,
  clinician: a.clinician ?? "",
  facility: a.facility ?? "",
  // trim a seconds suffix so it fits <input type="datetime-local">
  scheduledFor: a.scheduledFor.slice(0, 16),
  status: a.status,
  reason: a.reason ?? "",
  notes: a.notes ?? "",
});

export function validateAppointment(d: AppointmentDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.title.trim()) e.title = "What's the visit for?";
  if (!d.scheduledFor) e.scheduledFor = "Pick a date and time.";
  return e;
}

export function appointmentFromDraft(d: AppointmentDraft, base?: Appointment): Appointment {
  return {
    id: base?.id ?? genId("ap"),
    title: d.title.trim(),
    clinician: d.clinician.trim() || undefined,
    facility: d.facility.trim() || undefined,
    scheduledFor: d.scheduledFor,
    status: d.status,
    reason: d.reason.trim() || undefined,
    notes: d.notes.trim() || undefined,
  };
}

/* -------------------------------------------------------------- document -- */

export interface DocumentDraft {
  title: string;
  docType: DocumentType;
  documentDate: string;
  file: File | null;
  existingFileName?: string;
  existingFileSize?: number;
  existingMimeType?: string;
}

export const emptyDocumentDraft = (docType: DocumentType = "LAB_RESULT"): DocumentDraft => ({
  title: "",
  docType,
  documentDate: "",
  file: null,
});

export const documentToDraft = (doc: HealthDocument): DocumentDraft => ({
  title: doc.title,
  docType: doc.docType,
  documentDate: doc.documentDate ?? "",
  file: null,
  existingFileName: doc.fileName,
  existingFileSize: doc.fileSize,
  existingMimeType: doc.mimeType,
});

export function validateDocument(d: DocumentDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.title.trim()) e.title = "Give the document a title.";
  if (!d.file && !d.existingFileName) e.file = "Attach the file.";
  return e;
}

export function documentFromDraft(d: DocumentDraft, base?: HealthDocument): HealthDocument {
  const fileName = d.file?.name ?? d.existingFileName ?? "attachment";
  const fileSize = d.file?.size ?? d.existingFileSize ?? 0;
  const mimeType = d.file?.type || d.existingMimeType;
  return {
    id: base?.id ?? genId("doc"),
    title: d.title.trim(),
    docType: d.docType,
    fileName,
    fileSize,
    mimeType: mimeType || undefined,
    documentDate: d.documentDate || undefined,
    uploadedAt: base?.uploadedAt ?? new Date().toISOString(),
  };
}

/* ----------------------------------------------------------- immunization -- */

export interface ImmunizationDraft {
  vaccine: string;
  doseNumber: string;
  administeredOn: string;
  nextDue: string;
  notes: string;
}

export const emptyImmunizationDraft = (): ImmunizationDraft => ({
  vaccine: "",
  doseNumber: "",
  administeredOn: "",
  nextDue: "",
  notes: "",
});

export const immunizationToDraft = (im: Immunization): ImmunizationDraft => ({
  vaccine: im.vaccine,
  doseNumber: im.doseNumber != null ? String(im.doseNumber) : "",
  administeredOn: im.administeredOn,
  nextDue: im.nextDue ?? "",
  notes: im.notes ?? "",
});

export function validateImmunization(d: ImmunizationDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.vaccine.trim()) e.vaccine = "Enter the vaccine name.";
  if (!d.administeredOn) e.administeredOn = "When was it given?";
  return e;
}

export function immunizationFromDraft(d: ImmunizationDraft, base?: Immunization): Immunization {
  return {
    id: base?.id ?? genId("im"),
    vaccine: d.vaccine.trim(),
    doseNumber: numOrUndef(d.doseNumber),
    administeredOn: d.administeredOn,
    nextDue: d.nextDue || undefined,
    notes: d.notes.trim() || undefined,
  };
}

/* --------------------------------------------------------- profile basics -- */

export interface ProfileBasicsDraft {
  fullName: string;
  dateOfBirth: string;
  sex: Sex | "";
  bloodType: BloodType | "";
  genotype: HealthProfile["genotype"] | "";
  heightCm: string;
  weightKg: string;
  phone: string;
  city: string;
}

export const emptyProfileBasicsDraft = (): ProfileBasicsDraft => ({
  fullName: "",
  dateOfBirth: "",
  sex: "",
  bloodType: "",
  genotype: "",
  heightCm: "",
  weightKg: "",
  phone: "",
  city: "",
});

export const profileToBasicsDraft = (p: HealthProfile): ProfileBasicsDraft => ({
  fullName: p.fullName,
  dateOfBirth: p.dateOfBirth ?? "",
  sex: p.sex ?? "",
  bloodType: p.bloodType ?? "",
  genotype: p.genotype ?? "",
  heightCm: p.heightCm != null ? String(p.heightCm) : "",
  weightKg: p.weightKg != null ? String(p.weightKg) : "",
  phone: p.phone ?? "",
  city: p.city ?? "",
});

export function validateProfileBasics(d: ProfileBasicsDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.fullName.trim()) e.fullName = "Enter your name.";
  return e;
}

export function profileBasicsToPatch(d: ProfileBasicsDraft): Partial<HealthProfile> {
  return {
    fullName: d.fullName.trim(),
    dateOfBirth: d.dateOfBirth || undefined,
    sex: d.sex || undefined,
    bloodType: d.bloodType || undefined,
    genotype: d.genotype || undefined,
    heightCm: numOrUndef(d.heightCm),
    weightKg: numOrUndef(d.weightKg),
    phone: d.phone.trim() || undefined,
    city: d.city.trim() || undefined,
  };
}

/* ------------------------------------------------------- emergency contact -- */

export interface ContactDraft {
  name: string;
  relationship: string;
  phone: string;
  altPhone: string;
}

export const emptyContactDraft = (): ContactDraft => ({
  name: "",
  relationship: "",
  phone: "",
  altPhone: "",
});

export const contactToDraft = (c: EmergencyContact): ContactDraft => ({
  name: c.name,
  relationship: c.relationship,
  phone: c.phone,
  altPhone: c.altPhone ?? "",
});

export function validateContact(d: ContactDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.name.trim()) e.name = "Enter their name.";
  if (!d.phone.trim()) e.phone = "Enter a phone number.";
  return e;
}

export function contactFromDraft(d: ContactDraft, priority: number, base?: EmergencyContact): EmergencyContact {
  return {
    id: base?.id ?? genId("ec"),
    name: d.name.trim(),
    relationship: d.relationship.trim(),
    phone: d.phone.trim(),
    altPhone: d.altPhone.trim() || undefined,
    priority,
  };
}
