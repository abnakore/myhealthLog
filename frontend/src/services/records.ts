/**
 * Health records API calls.
 * Maps to /api/v1/records/* — all 8 record types.
 *
 * The backend uses snake_case field names; this module maps them to the
 * frontend's camelCase types from @/types/health.
 */
import { api, buildFormData, hasFile } from "./api";
import type {
  AiExtractionResult,
  Allergy,
  Attachable,
  Appointment,
  Condition,
  HealthDocument,
  Immunization,
  Medication,
  Procedure,
  VitalReading,
} from "@/types/health";

// ---------------------------------------------------------------------------
// Generic paginated list response
// ---------------------------------------------------------------------------

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

async function fetchAll<T>(url: string): Promise<T[]> {
  // For simplicity we fetch page_size=200 to get the full list.
  // The backend max_page_size is 100, so we use two fetches if needed.
  const res = await api.get<PaginatedResponse<T>>(url, { params: { page_size: 100 } });
  let results = res.data.results;
  // If there are more pages, fetch them
  let next = res.data.next;
  while (next) {
    const r2 = await api.get<PaginatedResponse<T>>(next);
    results = results.concat(r2.data.results);
    next = r2.data.next;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Attachments — shared by every record kind that can carry a file
// ---------------------------------------------------------------------------

type BackendAttachment = {
  document_file_name?: string;
  document_mime_type?: string;
  document_file_size?: number;
  fileUrl?: string | null;
  ai_extraction?: Record<string, unknown> | null;
  ai_extraction_status?: string;
};

function toAttachment(b: BackendAttachment): Attachable {
  return {
    fileName: b.document_file_name || undefined,
    mimeType: b.document_mime_type || undefined,
    fileSize: b.document_file_size || undefined,
    fileUrl: b.fileUrl ?? undefined,
    aiExtraction: (b.ai_extraction as AiExtractionResult | null) ?? undefined,
    aiExtractionStatus: (b.ai_extraction_status || undefined) as Attachable["aiExtractionStatus"],
  };
}

/**
 * POST/PATCH a record, as multipart when a file is being attached and JSON
 * otherwise. `removeFile` asks the backend to drop the current attachment.
 */
async function sendRecord<T>(
  method: "post" | "patch",
  url: string,
  payload: Record<string, unknown>,
  extra: { file?: File | null; removeFile?: boolean },
): Promise<T> {
  if (extra.removeFile && !extra.file) payload.remove_file = true;
  if (extra.file) {
    const fd = buildFormData({ ...payload, file: extra.file });
    const res = await api[method]<T>(url, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  }
  const res = await api[method]<T>(url, payload);
  return res.data;
}

type FileInput = { file?: File | null; removeFile?: boolean };

// ---------------------------------------------------------------------------
// Allergy
// ---------------------------------------------------------------------------

type BackendAllergy = BackendAttachment & {
  id: string;
  substance: string;
  allergy_type: string;
  severity: string;
  reactions: string[];
  triggers: string[];
  first_reaction_date: string | null;
  is_verified: boolean;
  notes: string;
  source: string;
  condition_ids: string[];
  provenance: Allergy["provenance"];
  is_critical: boolean;
  created_at: string;
  updated_at: string;
};

export function toAllergy(b: BackendAllergy): Allergy {
  return {
    id: b.id,
    substance: b.substance,
    allergyType: b.allergy_type as Allergy["allergyType"],
    severity: b.severity as Allergy["severity"],
    reactions: b.reactions,
    triggers: b.triggers,
    firstReactionDate: b.first_reaction_date ?? undefined,
    isVerified: b.is_verified,
    notes: b.notes || undefined,
    source: b.source as Allergy["source"],
    conditionIds: b.condition_ids.length > 0 ? b.condition_ids : undefined,
    provenance: b.provenance ?? undefined,
    ...toAttachment(b),
  };
}

export async function fetchAllergies(): Promise<Allergy[]> {
  const data = await fetchAll<BackendAllergy>("/v1/records/allergies/");
  return data.map(toAllergy);
}

export async function createAllergy(a: Partial<Allergy> & FileInput): Promise<Allergy> {
  const data = await sendRecord<BackendAllergy>("post", "/v1/records/allergies/", {
    substance: a.substance,
    allergy_type: a.allergyType ?? "DRUG",
    severity: a.severity ?? "MILD",
    reactions: a.reactions ?? [],
    triggers: a.triggers ?? [],
    first_reaction_date: a.firstReactionDate ?? null,
    is_verified: a.isVerified ?? false,
    notes: a.notes ?? "",
    source: a.source ?? "SELF_REPORTED",
    condition_ids: a.conditionIds ?? [],
  }, a);
  return toAllergy(data);
}

export async function updateAllergy(id: string, a: Partial<Allergy> & FileInput): Promise<Allergy> {
  const payload: Record<string, unknown> = {};
  if (a.substance !== undefined)          payload.substance = a.substance;
  if (a.allergyType !== undefined)        payload.allergy_type = a.allergyType;
  if (a.severity !== undefined)           payload.severity = a.severity;
  if (a.reactions !== undefined)          payload.reactions = a.reactions;
  if (a.triggers !== undefined)           payload.triggers = a.triggers;
  if (a.firstReactionDate !== undefined)  payload.first_reaction_date = a.firstReactionDate;
  if (a.isVerified !== undefined)         payload.is_verified = a.isVerified;
  if (a.notes !== undefined)              payload.notes = a.notes;
  if (a.conditionIds !== undefined)       payload.condition_ids = a.conditionIds;
  return toAllergy(await sendRecord<BackendAllergy>("patch", `/v1/records/allergies/${id}/`, payload, a));
}

export async function deleteAllergy(id: string): Promise<void> {
  await api.delete(`/v1/records/allergies/${id}/`);
}

// ---------------------------------------------------------------------------
// Medication
// ---------------------------------------------------------------------------

type BackendMedication = BackendAttachment & {
  id: string;
  name: string;
  dosage: string;
  form: string;
  route: string;
  frequency: string;
  duration: string;
  start_date: string;
  end_date: string | null;
  prescriber: string;
  reason: string;
  notes: string;
  active: boolean;
  source: string;
  condition_ids: string[];
  provenance: Medication["provenance"];
  created_at: string;
  updated_at: string;
};

export function toMedication(b: BackendMedication): Medication {
  return {
    id: b.id,
    name: b.name,
    dosage: b.dosage,
    form: b.form || undefined,
    route: b.route || undefined,
    frequency: b.frequency,
    duration: b.duration || undefined,
    startDate: b.start_date,
    endDate: b.end_date ?? undefined,
    prescriber: b.prescriber || undefined,
    reason: b.reason || undefined,
    notes: b.notes || undefined,
    active: b.active,
    source: b.source as Medication["source"],
    conditionIds: b.condition_ids.length > 0 ? b.condition_ids : undefined,
    provenance: b.provenance ?? undefined,
    ...toAttachment(b),
  };
}

function medPayload(m: Partial<Medication>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (m.name !== undefined)        p.name = m.name;
  if (m.dosage !== undefined)      p.dosage = m.dosage;
  if (m.form !== undefined)        p.form = m.form ?? "";
  if (m.route !== undefined)       p.route = m.route ?? "";
  if (m.frequency !== undefined)   p.frequency = m.frequency;
  if (m.duration !== undefined)    p.duration = m.duration ?? "";
  if (m.startDate !== undefined)   p.start_date = m.startDate;
  if (m.endDate !== undefined)     p.end_date = m.endDate ?? null;
  if (m.prescriber !== undefined)  p.prescriber = m.prescriber ?? "";
  if (m.reason !== undefined)      p.reason = m.reason ?? "";
  if (m.notes !== undefined)       p.notes = m.notes ?? "";
  if (m.active !== undefined)      p.active = m.active;
  if (m.source !== undefined)      p.source = m.source;
  if (m.conditionIds !== undefined) p.condition_ids = m.conditionIds ?? [];
  return p;
}

export async function fetchMedications(): Promise<Medication[]> {
  const data = await fetchAll<BackendMedication>("/v1/records/medications/");
  return data.map(toMedication);
}

export async function createMedication(m: Partial<Medication> & FileInput): Promise<Medication> {
  const payload: Record<string, unknown> = {
    ...medPayload(m),
    source: m.source ?? "SELF_REPORTED",
    active: m.active ?? true,
  };
  return toMedication(await sendRecord<BackendMedication>("post", "/v1/records/medications/", payload, m));
}

export async function updateMedication(
  id: string,
  m: Partial<Medication> & FileInput,
): Promise<Medication> {
  return toMedication(
    await sendRecord<BackendMedication>("patch", `/v1/records/medications/${id}/`, medPayload(m), m),
  );
}

export async function deleteMedication(id: string): Promise<void> {
  await api.delete(`/v1/records/medications/${id}/`);
}

// ---------------------------------------------------------------------------
// Condition
// ---------------------------------------------------------------------------

type BackendCondition = BackendAttachment & {
  id: string;
  name: string;
  status: string;
  severity: string;
  onset_date: string | null;
  resolved_date: string | null;
  icd10_code: string;
  diagnosed_by: string;
  notes: string;
  source: string;
  provenance: Condition["provenance"];
  created_at: string;
  updated_at: string;
};

export function toCondition(b: BackendCondition): Condition {
  return {
    id: b.id,
    name: b.name,
    status: b.status as Condition["status"],
    severity: (b.severity as Condition["severity"]) || undefined,
    onsetDate: b.onset_date ?? undefined,
    resolvedDate: b.resolved_date ?? undefined,
    icd10Code: b.icd10_code || undefined,
    diagnosedBy: b.diagnosed_by || undefined,
    notes: b.notes || undefined,
    source: b.source as Condition["source"],
    provenance: b.provenance ?? undefined,
    ...toAttachment(b),
  };
}

function condPayload(c: Partial<Condition>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (c.name !== undefined)        p.name = c.name;
  if (c.status !== undefined)      p.status = c.status;
  if (c.severity !== undefined)    p.severity = c.severity ?? "";
  if (c.onsetDate !== undefined)   p.onset_date = c.onsetDate ?? null;
  if (c.resolvedDate !== undefined) p.resolved_date = c.resolvedDate ?? null;
  if (c.icd10Code !== undefined)   p.icd10_code = c.icd10Code ?? "";
  if (c.diagnosedBy !== undefined) p.diagnosed_by = c.diagnosedBy ?? "";
  if (c.notes !== undefined)       p.notes = c.notes ?? "";
  if (c.source !== undefined)      p.source = c.source;
  return p;
}

export async function fetchConditions(): Promise<Condition[]> {
  const data = await fetchAll<BackendCondition>("/v1/records/conditions/");
  return data.map(toCondition);
}

export async function createCondition(c: Partial<Condition> & FileInput): Promise<Condition> {
  const payload: Record<string, unknown> = {
    ...condPayload(c),
    source: c.source ?? "SELF_REPORTED",
  };
  return toCondition(await sendRecord<BackendCondition>("post", "/v1/records/conditions/", payload, c));
}

export async function updateCondition(
  id: string,
  c: Partial<Condition> & FileInput,
): Promise<Condition> {
  return toCondition(
    await sendRecord<BackendCondition>("patch", `/v1/records/conditions/${id}/`, condPayload(c), c),
  );
}

export async function deleteCondition(id: string): Promise<void> {
  await api.delete(`/v1/records/conditions/${id}/`);
}

// ---------------------------------------------------------------------------
// Appointment
// ---------------------------------------------------------------------------

type BackendAppointment = BackendAttachment & {
  id: string;
  title: string;
  clinician: string;
  facility: string;
  scheduled_for: string;
  status: string;
  reason: string;
  notes: string;
  condition_ids: string[];
  provenance: Appointment["provenance"];
  created_at: string;
  updated_at: string;
};

export function toAppointment(b: BackendAppointment): Appointment {
  return {
    id: b.id,
    title: b.title,
    clinician: b.clinician || undefined,
    facility: b.facility || undefined,
    scheduledFor: b.scheduled_for,
    status: b.status as Appointment["status"],
    reason: b.reason || undefined,
    notes: b.notes || undefined,
    conditionIds: b.condition_ids.length > 0 ? b.condition_ids : undefined,
    provenance: b.provenance ?? undefined,
    ...toAttachment(b),
  };
}

export async function fetchAppointments(): Promise<Appointment[]> {
  const data = await fetchAll<BackendAppointment>("/v1/records/appointments/");
  return data.map(toAppointment);
}

export async function createAppointment(a: Partial<Appointment> & FileInput): Promise<Appointment> {
  const data = await sendRecord<BackendAppointment>("post", "/v1/records/appointments/", {
    title: a.title,
    clinician: a.clinician ?? "",
    facility: a.facility ?? "",
    scheduled_for: a.scheduledFor,
    status: a.status ?? "SCHEDULED",
    reason: a.reason ?? "",
    notes: a.notes ?? "",
    condition_ids: a.conditionIds ?? [],
  }, a);
  return toAppointment(data);
}

export async function updateAppointment(id: string, a: Partial<Appointment> & FileInput): Promise<Appointment> {
  const payload: Record<string, unknown> = {};
  if (a.title !== undefined)        payload.title = a.title;
  if (a.clinician !== undefined)    payload.clinician = a.clinician ?? "";
  if (a.facility !== undefined)     payload.facility = a.facility ?? "";
  if (a.scheduledFor !== undefined) payload.scheduled_for = a.scheduledFor;
  if (a.status !== undefined)       payload.status = a.status;
  if (a.reason !== undefined)       payload.reason = a.reason ?? "";
  if (a.notes !== undefined)        payload.notes = a.notes ?? "";
  if (a.conditionIds !== undefined) payload.condition_ids = a.conditionIds ?? [];
  return toAppointment(
    await sendRecord<BackendAppointment>("patch", `/v1/records/appointments/${id}/`, payload, a),
  );
}

export async function deleteAppointment(id: string): Promise<void> {
  await api.delete(`/v1/records/appointments/${id}/`);
}

// ---------------------------------------------------------------------------
// HealthDocument
// ---------------------------------------------------------------------------

/** Re-run the AI reading of a record's attached file (any kind). */
export async function retryExtraction(routeKey: string, id: string): Promise<void> {
  await api.post(`/v1/records/${routeKey}/${id}/retry-extraction/`);
}

export type BackendDocument = {
  id: string;
  title: string;
  doc_type: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  document_date: string | null;
  uploaded_at: string;
  notes: string;
  lab_name: string;
  imaging_type: string;
  body_area: string;
  findings: string;
  provider: string;
  condition_ids: string[];
  provenance: HealthDocument["provenance"];
  ai_extraction: Record<string, unknown> | null;
  ai_extraction_status: string;
  fileUrl: string | null;
  created_at: string;
  updated_at: string;
};

export function toDocument(b: BackendDocument): HealthDocument {
  return {
    id: b.id,
    title: b.title,
    docType: b.doc_type as HealthDocument["docType"],
    fileName: b.file_name,
    fileSize: b.file_size,
    mimeType: b.mime_type || undefined,
    documentDate: b.document_date ?? undefined,
    uploadedAt: b.uploaded_at,
    notes: b.notes || undefined,
    labName: b.lab_name || undefined,
    imagingType: b.imaging_type || undefined,
    bodyArea: b.body_area || undefined,
    findings: b.findings || undefined,
    provider: b.provider || undefined,
    conditionIds: b.condition_ids.length > 0 ? b.condition_ids : undefined,
    provenance: b.provenance ?? undefined,
    fileUrl: b.fileUrl ?? undefined,
    aiExtraction: (b.ai_extraction as never) ?? undefined,
    aiExtractionStatus: b.ai_extraction_status as HealthDocument["aiExtractionStatus"],
  };
}

export async function fetchDocuments(): Promise<HealthDocument[]> {
  const data = await fetchAll<BackendDocument>("/v1/records/documents/");
  return data.map(toDocument);
}

export async function createDocument(
  d: Partial<HealthDocument> & { file: File },
): Promise<HealthDocument> {
  const payload: Record<string, unknown> = {
    title: d.title ?? d.file.name,
    doc_type: d.docType ?? "OTHER",
    document_date: d.documentDate ?? null,
    notes: d.notes ?? "",
    lab_name: d.labName ?? "",
    imaging_type: d.imagingType ?? "",
    body_area: d.bodyArea ?? "",
    findings: d.findings ?? "",
    provider: d.provider ?? "",
    condition_ids: d.conditionIds ?? [],
    file: d.file,
  };
  const fd = buildFormData(payload);
  const res = await api.post<BackendDocument>("/v1/records/documents/", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return toDocument(res.data);
}

export async function updateDocument(
  id: string,
  d: Partial<HealthDocument> & { file?: File | null },
): Promise<HealthDocument> {
  const payload: Record<string, unknown> = {};
  if (d.title !== undefined)        payload.title = d.title;
  if (d.docType !== undefined)      payload.doc_type = d.docType;
  if (d.documentDate !== undefined) payload.document_date = d.documentDate ?? null;
  if (d.notes !== undefined)        payload.notes = d.notes ?? "";
  if (d.labName !== undefined)      payload.lab_name = d.labName ?? "";
  if (d.imagingType !== undefined)  payload.imaging_type = d.imagingType ?? "";
  if (d.bodyArea !== undefined)     payload.body_area = d.bodyArea ?? "";
  if (d.findings !== undefined)     payload.findings = d.findings ?? "";
  if (d.provider !== undefined)     payload.provider = d.provider ?? "";
  if (d.conditionIds !== undefined) payload.condition_ids = d.conditionIds ?? [];
  if (d.file) {
    payload.file = d.file;
    const fd = buildFormData(payload);
    const res = await api.patch<BackendDocument>(`/v1/records/documents/${id}/`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return toDocument(res.data);
  }
  const res = await api.patch<BackendDocument>(`/v1/records/documents/${id}/`, payload);
  return toDocument(res.data);
}

export async function deleteDocument(id: string): Promise<void> {
  await api.delete(`/v1/records/documents/${id}/`);
}

// ---------------------------------------------------------------------------
// Procedure
// ---------------------------------------------------------------------------

type BackendProcedure = {
  id: string;
  name: string;
  performed_on: string;
  facility: string;
  clinician: string;
  outcome: string;
  notes: string;
  condition_ids: string[];
  provenance: Procedure["provenance"];
  created_at: string;
  updated_at: string;
};

export function toProcedure(b: BackendProcedure): Procedure {
  return {
    id: b.id,
    name: b.name,
    performedOn: b.performed_on,
    facility: b.facility || undefined,
    clinician: b.clinician || undefined,
    outcome: b.outcome || undefined,
    notes: b.notes || undefined,
    conditionIds: b.condition_ids.length > 0 ? b.condition_ids : undefined,
    provenance: b.provenance ?? undefined,
  };
}

export async function fetchProcedures(): Promise<Procedure[]> {
  const data = await fetchAll<BackendProcedure>("/v1/records/procedures/");
  return data.map(toProcedure);
}

export async function createProcedure(p: Partial<Procedure>): Promise<Procedure> {
  const res = await api.post<BackendProcedure>("/v1/records/procedures/", {
    name: p.name,
    performed_on: p.performedOn,
    facility: p.facility ?? "",
    clinician: p.clinician ?? "",
    outcome: p.outcome ?? "",
    notes: p.notes ?? "",
    condition_ids: p.conditionIds ?? [],
  });
  return toProcedure(res.data);
}

export async function updateProcedure(id: string, p: Partial<Procedure>): Promise<Procedure> {
  const payload: Record<string, unknown> = {};
  if (p.name !== undefined)         payload.name = p.name;
  if (p.performedOn !== undefined)  payload.performed_on = p.performedOn;
  if (p.facility !== undefined)     payload.facility = p.facility ?? "";
  if (p.clinician !== undefined)    payload.clinician = p.clinician ?? "";
  if (p.outcome !== undefined)      payload.outcome = p.outcome ?? "";
  if (p.notes !== undefined)        payload.notes = p.notes ?? "";
  if (p.conditionIds !== undefined) payload.condition_ids = p.conditionIds ?? [];
  const res = await api.patch<BackendProcedure>(`/v1/records/procedures/${id}/`, payload);
  return toProcedure(res.data);
}

export async function deleteProcedure(id: string): Promise<void> {
  await api.delete(`/v1/records/procedures/${id}/`);
}

// ---------------------------------------------------------------------------
// Immunization
// ---------------------------------------------------------------------------

type BackendImmunization = {
  id: string;
  vaccine: string;
  dose_number: number | null;
  administered_on: string;
  next_due: string | null;
  notes: string;
  condition_ids: string[];
  provenance: Immunization["provenance"];
  created_at: string;
  updated_at: string;
};

export function toImmunization(b: BackendImmunization): Immunization {
  return {
    id: b.id,
    vaccine: b.vaccine,
    doseNumber: b.dose_number ?? undefined,
    administeredOn: b.administered_on,
    nextDue: b.next_due ?? undefined,
    notes: b.notes || undefined,
    conditionIds: b.condition_ids.length > 0 ? b.condition_ids : undefined,
    provenance: b.provenance ?? undefined,
  };
}

export async function fetchImmunizations(): Promise<Immunization[]> {
  const data = await fetchAll<BackendImmunization>("/v1/records/immunizations/");
  return data.map(toImmunization);
}

export async function createImmunization(im: Partial<Immunization>): Promise<Immunization> {
  const res = await api.post<BackendImmunization>("/v1/records/immunizations/", {
    vaccine: im.vaccine,
    dose_number: im.doseNumber ?? null,
    administered_on: im.administeredOn,
    next_due: im.nextDue ?? null,
    notes: im.notes ?? "",
    condition_ids: im.conditionIds ?? [],
  });
  return toImmunization(res.data);
}

export async function updateImmunization(id: string, im: Partial<Immunization>): Promise<Immunization> {
  const payload: Record<string, unknown> = {};
  if (im.vaccine !== undefined)         payload.vaccine = im.vaccine;
  if (im.doseNumber !== undefined)      payload.dose_number = im.doseNumber ?? null;
  if (im.administeredOn !== undefined)  payload.administered_on = im.administeredOn;
  if (im.nextDue !== undefined)         payload.next_due = im.nextDue ?? null;
  if (im.notes !== undefined)           payload.notes = im.notes ?? "";
  if (im.conditionIds !== undefined)    payload.condition_ids = im.conditionIds ?? [];
  const res = await api.patch<BackendImmunization>(`/v1/records/immunizations/${id}/`, payload);
  return toImmunization(res.data);
}

export async function deleteImmunization(id: string): Promise<void> {
  await api.delete(`/v1/records/immunizations/${id}/`);
}

// ---------------------------------------------------------------------------
// VitalReading
// ---------------------------------------------------------------------------

type BackendVital = BackendAttachment & {
  id: string;
  vital_type: string;
  value: string;          // decimal comes as string
  value2: string | null;
  unit: string;
  measured_at: string;
  context: string;
  label: string;
  notes: string;
  condition_ids: string[];
  provenance: VitalReading["provenance"];
  created_at: string;
  updated_at: string;
};

export function toVital(b: BackendVital): VitalReading {
  return {
    id: b.id,
    vitalType: b.vital_type as VitalReading["vitalType"],
    value: parseFloat(b.value),
    value2: b.value2 != null ? parseFloat(b.value2) : undefined,
    unit: b.unit,
    measuredAt: b.measured_at,
    context: b.context || undefined,
    label: b.label || undefined,
    notes: b.notes || undefined,
    conditionIds: b.condition_ids.length > 0 ? b.condition_ids : undefined,
    provenance: b.provenance ?? undefined,
    ...toAttachment(b),
  };
}

export async function fetchVitals(): Promise<VitalReading[]> {
  const data = await fetchAll<BackendVital>("/v1/records/vitals/");
  return data.map(toVital);
}

export async function createVital(
  v: Partial<VitalReading> & FileInput,
): Promise<VitalReading> {
  const payload: Record<string, unknown> = {
    vital_type: v.vitalType,
    value: v.value,
    value2: v.value2 ?? null,
    unit: v.unit ?? "",
    measured_at: v.measuredAt,
    context: v.context ?? "",
    label: v.label ?? "",
    notes: v.notes ?? "",
    condition_ids: v.conditionIds ?? [],
  };
  return toVital(await sendRecord<BackendVital>("post", "/v1/records/vitals/", payload, v));
}

export async function updateVital(
  id: string,
  v: Partial<VitalReading> & FileInput,
): Promise<VitalReading> {
  const payload: Record<string, unknown> = {};
  if (v.vitalType !== undefined)    payload.vital_type = v.vitalType;
  if (v.value !== undefined)        payload.value = v.value;
  if (v.value2 !== undefined)       payload.value2 = v.value2 ?? null;
  if (v.unit !== undefined)         payload.unit = v.unit;
  if (v.measuredAt !== undefined)   payload.measured_at = v.measuredAt;
  if (v.context !== undefined)      payload.context = v.context ?? "";
  if (v.label !== undefined)        payload.label = v.label ?? "";
  if (v.notes !== undefined)        payload.notes = v.notes ?? "";
  if (v.conditionIds !== undefined) payload.condition_ids = v.conditionIds ?? [];
  return toVital(await sendRecord<BackendVital>("patch", `/v1/records/vitals/${id}/`, payload, v));
}

export async function deleteVital(id: string): Promise<void> {
  await api.delete(`/v1/records/vitals/${id}/`);
}

// Re-export the hasFile helper so callers can use it without a separate import
export { hasFile };
