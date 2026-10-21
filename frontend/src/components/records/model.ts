/**
 * Form models for every writable record. Each type has: a Draft (string-based, what
 * the controlled inputs hold), an empty draft, a record→draft seeder (for editing), a
 * validator (returns only the fields in error), and a draft→record builder. The Add
 * page, the per-category edit modals, and the onboarding steps all build on these, so
 * a field is defined once and never drifts between "add" and "edit".
 */
import { genId } from "@/lib/id";
import {
  IMAGING_TYPE_OTHER,
  IMAGING_TYPES,
  MEDICATION_FORM_OTHER,
  MEDICATION_FORMS,
  VITAL_META,
} from "@/types/health";
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
  VitalReading,
  VitalType,
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
  /** Conditions this allergy relates to — optional, and often empty. */
  conditionIds: string[];
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
  conditionIds: [],
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
  conditionIds: a.conditionIds ?? [],
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
    conditionIds: d.conditionIds.length > 0 ? d.conditionIds : undefined,
  };
}

/* ------------------------------------------------------------ medication -- */

export interface MedicationDraft {
  name: string;
  dosage: string;
  form: string; // a MEDICATION_FORMS entry, or MEDICATION_FORM_OTHER
  formOther: string; // the typed-in form, when form is Other
  frequency: string;
  duration: string; // how long the course runs, e.g. "7 days"
  startDate: string;
  endDate: string;
  prescriber: string;
  reason: string;
  notes: string;
  /** An optional attachment — the prescriber's written note, a pack photo. */
  file: File | null;
  existingFileName?: string;
  existingFileSize?: number;
  existingMimeType?: string;
  active: boolean;
  /** Conditions this medication is for — none, one, or several. */
  conditionIds: string[];
}

export const emptyMedicationDraft = (): MedicationDraft => ({
  name: "",
  dosage: "",
  form: "",
  formOther: "",
  frequency: "",
  duration: "",
  startDate: "",
  endDate: "",
  prescriber: "",
  reason: "",
  notes: "",
  file: null,
  active: true,
  conditionIds: [],
});

export const medicationToDraft = (m: Medication): MedicationDraft => {
  // A form typed in by hand (or from an older record) isn't on the picker list —
  // select "Other" and put the stored value in the free-text input.
  const knownForm = !!m.form && MEDICATION_FORMS.includes(m.form);
  return {
    name: m.name,
    dosage: m.dosage,
    form: m.form ? (knownForm ? m.form : MEDICATION_FORM_OTHER) : "",
    formOther: m.form && !knownForm ? m.form : "",
    frequency: m.frequency,
    duration: m.duration ?? "",
    startDate: m.startDate,
    endDate: m.endDate ?? "",
    prescriber: m.prescriber ?? "",
    reason: m.reason ?? "",
    notes: m.notes ?? "",
    file: null,
    existingFileName: m.fileName,
    existingFileSize: m.fileSize,
    existingMimeType: m.mimeType,
    active: m.active,
    conditionIds: m.conditionIds ?? [],
  };
};

export function validateMedication(d: MedicationDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.name.trim()) e.name = "Enter the medication name.";
  if (d.form === MEDICATION_FORM_OTHER && !d.formOther.trim()) {
    e.formOther = "Type the form, or pick one from the list.";
  }
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
    form:
      (d.form === MEDICATION_FORM_OTHER ? d.formOther.trim() : d.form.trim()) || undefined,
    frequency: d.frequency.trim(),
    duration: d.duration.trim() || undefined,
    startDate: d.startDate,
    endDate: d.endDate || undefined,
    prescriber: d.prescriber.trim() || undefined,
    reason: d.reason.trim() || undefined,
    notes: d.notes.trim() || undefined,
    fileName: d.file?.name ?? d.existingFileName,
    fileSize: d.file?.size ?? d.existingFileSize,
    mimeType: d.file?.type || d.existingMimeType,
    active: d.active,
    source: base?.source ?? "SELF_REPORTED",
    conditionIds: d.conditionIds.length > 0 ? d.conditionIds : undefined,
  };
}

/* ------------------------------------------------------------- condition -- */

export interface ConditionDraft {
  name: string;
  status: ConditionStatus;
  severity: ClinicalSeverity | "";
  onsetDate: string;
  resolvedDate: string;
  icd10Code: string;
  diagnosedBy: string;
  notes: string;
  /** An optional document that confirms the condition — a letter or report. */
  file: File | null;
  existingFileName?: string;
  existingFileSize?: number;
  existingMimeType?: string;
}

export const emptyConditionDraft = (): ConditionDraft => ({
  name: "",
  status: "ACTIVE",
  severity: "",
  onsetDate: "",
  resolvedDate: "",
  icd10Code: "",
  diagnosedBy: "",
  notes: "",
  file: null,
});

export const conditionToDraft = (c: Condition): ConditionDraft => ({
  name: c.name,
  status: c.status,
  severity: c.severity ?? "",
  onsetDate: c.onsetDate ?? "",
  resolvedDate: c.resolvedDate ?? "",
  icd10Code: c.icd10Code ?? "",
  diagnosedBy: c.diagnosedBy ?? "",
  notes: c.notes ?? "",
  file: null,
  existingFileName: c.fileName,
  existingFileSize: c.fileSize,
  existingMimeType: c.mimeType,
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
    icd10Code: d.icd10Code.trim() || undefined,
    diagnosedBy: d.diagnosedBy.trim() || undefined,
    notes: d.notes.trim() || undefined,
    fileName: d.file?.name ?? d.existingFileName,
    fileSize: d.file?.size ?? d.existingFileSize,
    mimeType: d.file?.type || d.existingMimeType,
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
  conditionIds: string[];
}

export const emptyAppointmentDraft = (): AppointmentDraft => ({
  title: "",
  clinician: "",
  facility: "",
  scheduledFor: "",
  status: "SCHEDULED",
  reason: "",
  notes: "",
  conditionIds: [],
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
  conditionIds: a.conditionIds ?? [],
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
    conditionIds: d.conditionIds.length > 0 ? d.conditionIds : undefined,
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
  notes: string;
  /** The lab that produced a result — shown when the kind is a lab result. */
  labName: string;
  /** Imaging specifics — shown when the kind is a scan. */
  imagingType: string; // an IMAGING_TYPES entry, or IMAGING_TYPE_OTHER
  imagingTypeOther: string; // the typed-in kind, when imagingType is Other
  bodyArea: string;
  findings: string;
  provider: string;
  conditionIds: string[];
}

export const emptyDocumentDraft = (docType: DocumentType = "LAB_RESULT"): DocumentDraft => ({
  title: "",
  docType,
  documentDate: "",
  file: null,
  notes: "",
  labName: "",
  imagingType: "",
  imagingTypeOther: "",
  bodyArea: "",
  findings: "",
  provider: "",
  conditionIds: [],
});

export const documentToDraft = (doc: HealthDocument): DocumentDraft => {
  // A typed-in imaging kind isn't on the picker list — select "Other imaging"
  // and put the stored value in the free-text input.
  const knownImaging = !!doc.imagingType && IMAGING_TYPES.includes(doc.imagingType);
  return {
    title: doc.title,
    docType: doc.docType,
    documentDate: doc.documentDate ?? "",
    file: null,
    existingFileName: doc.fileName,
    existingFileSize: doc.fileSize,
    existingMimeType: doc.mimeType,
    notes: doc.notes ?? "",
    labName: doc.labName ?? "",
    imagingType: doc.imagingType
      ? knownImaging
        ? doc.imagingType
        : IMAGING_TYPE_OTHER
      : "",
    imagingTypeOther: doc.imagingType && !knownImaging ? doc.imagingType : "",
    bodyArea: doc.bodyArea ?? "",
    findings: doc.findings ?? "",
    provider: doc.provider ?? "",
    conditionIds: doc.conditionIds ?? [],
  };
};

export function validateDocument(d: DocumentDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.title.trim()) e.title = "Give the document a title.";
  if (!d.file && !d.existingFileName) e.file = "Attach the file.";
  if (d.docType === "SCAN" && d.imagingType === IMAGING_TYPE_OTHER && !d.imagingTypeOther.trim()) {
    e.imagingTypeOther = "Type the imaging kind, or pick one from the list.";
  }
  return e;
}

export function documentFromDraft(d: DocumentDraft, base?: HealthDocument): HealthDocument {
  const fileName = d.file?.name ?? d.existingFileName ?? "attachment";
  const fileSize = d.file?.size ?? d.existingFileSize ?? 0;
  const mimeType = d.file?.type || d.existingMimeType;
  const isScan = d.docType === "SCAN";
  return {
    id: base?.id ?? genId("doc"),
    title: d.title.trim(),
    docType: d.docType,
    fileName,
    fileSize,
    mimeType: mimeType || undefined,
    documentDate: d.documentDate || undefined,
    uploadedAt: base?.uploadedAt ?? new Date().toISOString(),
    notes: d.notes.trim() || undefined,
    labName: d.docType === "LAB_RESULT" ? d.labName.trim() || undefined : undefined,
    imagingType: isScan
      ? (d.imagingType === IMAGING_TYPE_OTHER
          ? d.imagingTypeOther.trim()
          : d.imagingType.trim()) || undefined
      : undefined,
    bodyArea: isScan ? d.bodyArea.trim() || undefined : undefined,
    findings: isScan ? d.findings.trim() || undefined : undefined,
    provider: isScan ? d.provider.trim() || undefined : undefined,
    conditionIds: d.conditionIds.length > 0 ? d.conditionIds : undefined,
  };
}

/* ----------------------------------------------------------- immunization -- */

export interface ImmunizationDraft {
  vaccine: string;
  doseNumber: string;
  administeredOn: string;
  nextDue: string;
  notes: string;
  conditionIds: string[];
}

export const emptyImmunizationDraft = (): ImmunizationDraft => ({
  vaccine: "",
  doseNumber: "",
  administeredOn: "",
  nextDue: "",
  notes: "",
  conditionIds: [],
});

export const immunizationToDraft = (im: Immunization): ImmunizationDraft => ({
  vaccine: im.vaccine,
  doseNumber: im.doseNumber != null ? String(im.doseNumber) : "",
  administeredOn: im.administeredOn,
  nextDue: im.nextDue ?? "",
  notes: im.notes ?? "",
  conditionIds: im.conditionIds ?? [],
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
    conditionIds: d.conditionIds.length > 0 ? d.conditionIds : undefined,
  };
}

/* ----------------------------------------------------------------- vitals -- */

export interface VitalReadingDraft {
  vitalType: VitalType;
  value: string;
  value2: string; // second value for a paired reading (BP diastolic)
  unit: string; // seeded from VITAL_META; editable only for CUSTOM
  measuredAt: string; // datetime-local
  context: string;
  label: string; // name of a CUSTOM measurement
  notes: string;
  /** An optional attachment — a photo of the monitor reading, a clinic printout. */
  file: File | null;
  existingFileName?: string;
  existingFileSize?: number;
  existingMimeType?: string;
  conditionIds: string[];
}

// A datetime-local string ("YYYY-MM-DDTHH:mm") for right now, in local time.
function nowLocalDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const emptyVitalDraft = (vitalType: VitalType = "BLOOD_PRESSURE"): VitalReadingDraft => ({
  vitalType,
  value: "",
  value2: "",
  unit: VITAL_META[vitalType].unit,
  measuredAt: nowLocalDateTime(),
  context: "",
  label: "",
  notes: "",
  file: null,
  conditionIds: [],
});

export const vitalToDraft = (v: VitalReading): VitalReadingDraft => ({
  vitalType: v.vitalType,
  value: String(v.value),
  value2: v.value2 != null ? String(v.value2) : "",
  unit: v.unit,
  // trim a seconds suffix so it fits <input type="datetime-local">
  measuredAt: v.measuredAt.slice(0, 16),
  context: v.context ?? "",
  label: v.label ?? "",
  notes: v.notes ?? "",
  file: null,
  existingFileName: v.fileName,
  existingFileSize: v.fileSize,
  existingMimeType: v.mimeType,
  conditionIds: v.conditionIds ?? [],
});

export function validateVital(d: VitalReadingDraft): FieldErrors {
  const e: FieldErrors = {};
  const meta = VITAL_META[d.vitalType];
  if (d.vitalType === "CUSTOM") {
    if (!d.label.trim()) e.label = "Name this measurement.";
    if (!d.unit.trim()) e.unit = "Add a unit.";
  }
  if (numOrUndef(d.value) === undefined) {
    e.value = meta.dual ? "Enter the systolic value." : "Enter a value.";
  }
  if (meta.dual && numOrUndef(d.value2) === undefined) {
    e.value2 = "Enter the diastolic value.";
  }
  if (!d.measuredAt) e.measuredAt = "When did you take it?";
  return e;
}

export function vitalFromDraft(d: VitalReadingDraft, base?: VitalReading): VitalReading {
  const meta = VITAL_META[d.vitalType];
  return {
    id: base?.id ?? genId("vt"),
    vitalType: d.vitalType,
    value: numOrUndef(d.value) ?? 0,
    value2: meta.dual ? numOrUndef(d.value2) : undefined,
    unit: d.unit.trim() || meta.unit,
    measuredAt: d.measuredAt,
    context: d.context.trim() || undefined,
    label: d.vitalType === "CUSTOM" ? d.label.trim() || undefined : undefined,
    notes: d.notes.trim() || undefined,
    fileName: d.file?.name ?? d.existingFileName,
    fileSize: d.file?.size ?? d.existingFileSize,
    mimeType: d.file?.type || d.existingMimeType,
    conditionIds: d.conditionIds.length > 0 ? d.conditionIds : undefined,
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

/* ----------------------------------------------------------------- location -- */

export interface LocationDraft {
  phone: string;
  country: string;
  state: string;
  city: string;
  address: string;
}

export const emptyLocationDraft = (): LocationDraft => ({
  phone: "",
  country: "",
  state: "",
  city: "",
  address: "",
});

export const locationToDraft = (p: HealthProfile): LocationDraft => ({
  phone: p.phone ?? "",
  country: p.country ?? "",
  state: p.state ?? "",
  city: p.city ?? "",
  address: p.address ?? "",
});

export function locationToPatch(d: LocationDraft): Partial<HealthProfile> {
  return {
    phone: d.phone.trim() || undefined,
    country: d.country.trim() || undefined,
    state: d.state.trim() || undefined,
    city: d.city.trim() || undefined,
    address: d.address.trim() || undefined,
  };
}

/* ------------------------------------------------------- emergency contact -- */

export interface ContactDraft {
  name: string;
  relationship: string;
  phone: string;
  altPhone: string;
  language: string;
  notes: string;
}

export const emptyContactDraft = (): ContactDraft => ({
  name: "",
  relationship: "",
  phone: "",
  altPhone: "",
  language: "",
  notes: "",
});

export const contactToDraft = (c: EmergencyContact): ContactDraft => ({
  name: c.name,
  relationship: c.relationship,
  phone: c.phone,
  altPhone: c.altPhone ?? "",
  language: c.language ?? "",
  notes: c.notes ?? "",
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
    language: d.language.trim() || undefined,
    notes: d.notes.trim() || undefined,
  };
}
