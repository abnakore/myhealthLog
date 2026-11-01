/**
 * Data mobility — taking a copy of the record out of myHealthLog. Two shapes:
 *
 *  1. An HL7 FHIR R4 collection Bundle (.json) — the interoperable format hospitals
 *     and health apps can read back in. Mapping is faithful but light: it favours
 *     `text` codings over full terminology bindings, enough to be credible and
 *     round-trippable, not to claim conformance.
 *  2. A one-page clinical summary (.html) — the "first 60 seconds" a clinician needs:
 *     who this is, what could kill them, what they take, and their latest numbers.
 *     Self-contained and print-friendly, so it opens and prints anywhere.
 *
 * Everything here is pure (record in, string out) apart from the download helpers.
 */
import type {
  Allergy,
  Appointment,
  AppointmentStatus,
  AllergySeverity,
  Condition,
  ConditionStatus,
  HealthDocument,
  HealthProfile,
  Immunization,
  Medication,
  Procedure,
  VitalReading,
  VitalType,
} from "@/types/health";
import {
  ALLERGY_SEVERITY_LABELS,
  DOCUMENT_TYPE_LABELS,
  SEVERITY_LABELS,
  SEX_LABELS,
  formatVitalValue,
  isCriticalAllergy,
  vitalName,
  vitalStatus,
} from "@/types/health";
import { calcAge, formatDate } from "@/lib/format";

/** The whole record, as the record store exposes it. */
export interface RecordSnapshot {
  profile: HealthProfile;
  allergies: Allergy[];
  medications: Medication[];
  conditions: Condition[];
  appointments: Appointment[];
  documents: HealthDocument[];
  immunizations: Immunization[];
  procedures: Procedure[];
  vitals: VitalReading[];
}

/* ----------------------------------------------------------------- FHIR -- */

type FhirResource = Record<string, unknown> & { id: string; resourceType: string };
interface FhirEntry {
  fullUrl: string;
  resource: FhirResource;
}

const FHIR_GENDER: Record<string, string> = { MALE: "male", FEMALE: "female", OTHER: "other" };

const COND_STATUS: Record<ConditionStatus, string> = {
  ACTIVE: "active",
  RESOLVED: "resolved",
  IN_REMISSION: "remission",
};

const APPT_STATUS: Record<AppointmentStatus, string> = {
  SCHEDULED: "booked",
  ATTENDED: "fulfilled",
  MISSED: "noshow",
  CANCELLED: "cancelled",
};

/** LOINC codes for the vitals that have a standard one; the rest go out as `text`. */
const VITAL_LOINC: Partial<Record<VitalType, { code: string; display: string }>> = {
  BLOOD_PRESSURE: { code: "85354-9", display: "Blood pressure panel" },
  PULSE: { code: "8867-4", display: "Heart rate" },
  RESPIRATORY_RATE: { code: "9279-1", display: "Respiratory rate" },
  TEMPERATURE: { code: "8310-5", display: "Body temperature" },
  SPO2: { code: "59408-5", display: "Oxygen saturation in Arterial blood" },
  BLOOD_GLUCOSE: { code: "15074-8", display: "Glucose in Blood" },
  WEIGHT: { code: "29463-7", display: "Body weight" },
  HEIGHT: { code: "8302-2", display: "Body height" },
  BMI: { code: "39156-5", display: "Body mass index" },
};

function fhirReactionSeverity(sev: AllergySeverity): string {
  return sev === "MILD" ? "mild" : sev === "MODERATE" ? "moderate" : "severe";
}

/** Build an HL7 FHIR R4 collection Bundle from the record. */
export function buildFhirBundle(rec: RecordSnapshot): Record<string, unknown> {
  const p = rec.profile;
  const patientId = p.id || "patient";
  const patientRef = { reference: `urn:uuid:${patientId}` };
  const entries: FhirEntry[] = [];
  const push = (resource: FhirResource) =>
    entries.push({ fullUrl: `urn:uuid:${resource.id}`, resource });

  const hasAddress = Boolean(p.city || p.state || p.country || p.address);
  push({
    resourceType: "Patient",
    id: patientId,
    name: p.fullName ? [{ text: p.fullName }] : undefined,
    gender: p.sex ? FHIR_GENDER[p.sex] : undefined,
    birthDate: p.dateOfBirth,
    telecom: p.phone ? [{ system: "phone", value: p.phone, use: "mobile" }] : undefined,
    address: hasAddress
      ? [
          {
            text: [p.address, p.city, p.state, p.country].filter(Boolean).join(", "),
            city: p.city,
            state: p.state,
            country: p.country,
          },
        ]
      : undefined,
  });

  if (p.bloodType)
    push({
      resourceType: "Observation",
      id: `${patientId}-bloodgroup`,
      status: "final",
      code: {
        coding: [{ system: "http://loinc.org", code: "883-9", display: "ABO and Rh group [Type] in Blood" }],
        text: "Blood group",
      },
      subject: patientRef,
      valueString: p.bloodType,
    });

  if (p.genotype)
    push({
      resourceType: "Observation",
      id: `${patientId}-genotype`,
      status: "final",
      code: { text: "Haemoglobin genotype" },
      subject: patientRef,
      valueString: p.genotype,
    });

  for (const a of rec.allergies) {
    const category =
      a.allergyType === "DRUG"
        ? ["medication"]
        : a.allergyType === "FOOD"
          ? ["food"]
          : a.allergyType === "ENVIRONMENTAL"
            ? ["environment"]
            : undefined;
    push({
      resourceType: "AllergyIntolerance",
      id: a.id,
      clinicalStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
            code: "active",
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
            code: a.isVerified ? "confirmed" : "unconfirmed",
          },
        ],
      },
      type: "allergy",
      category,
      criticality: isCriticalAllergy(a.severity) ? "high" : "low",
      code: { text: a.substance },
      patient: patientRef,
      onsetDateTime: a.firstReactionDate,
      reaction: a.reactions?.length
        ? [
            {
              manifestation: a.reactions.map((r) => ({ text: r })),
              severity: fhirReactionSeverity(a.severity),
            },
          ]
        : undefined,
      note: a.notes ? [{ text: a.notes }] : undefined,
    });
  }

  for (const m of rec.medications)
    push({
      resourceType: "MedicationStatement",
      id: m.id,
      status: m.active ? "active" : "completed",
      medicationCodeableConcept: { text: m.name },
      subject: patientRef,
      effectivePeriod: { start: m.startDate, end: m.endDate },
      dosage: [
        {
          text: [m.dosage, m.frequency].filter(Boolean).join(", "),
          route: m.route ? { text: m.route } : undefined,
        },
      ],
      reasonCode: m.reason ? [{ text: m.reason }] : undefined,
      note: m.notes ? [{ text: m.notes }] : undefined,
    });

  for (const c of rec.conditions)
    push({
      resourceType: "Condition",
      id: c.id,
      clinicalStatus: {
        coding: [
          { system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: COND_STATUS[c.status] },
        ],
      },
      code: { text: c.name },
      subject: patientRef,
      onsetDateTime: c.onsetDate,
      abatementDateTime: c.resolvedDate,
      severity: c.severity ? { text: SEVERITY_LABELS[c.severity] } : undefined,
      note: c.notes ? [{ text: c.notes }] : undefined,
    });

  for (const v of rec.vitals) {
    const loinc = VITAL_LOINC[v.vitalType];
    const base = {
      resourceType: "Observation",
      id: v.id,
      status: "final",
      category: [
        {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" },
          ],
        },
      ],
      code: {
        coding: loinc ? [{ system: "http://loinc.org", code: loinc.code, display: loinc.display }] : undefined,
        text: vitalName(v),
      },
      subject: patientRef,
      effectiveDateTime: v.measuredAt,
      note: v.context ? [{ text: v.context }] : undefined,
    };
    if (v.vitalType === "BLOOD_PRESSURE" && v.value2 != null) {
      push({
        ...base,
        component: [
          {
            code: { coding: [{ system: "http://loinc.org", code: "8480-6", display: "Systolic blood pressure" }] },
            valueQuantity: { value: v.value, unit: v.unit, system: "http://unitsofmeasure.org", code: "mm[Hg]" },
          },
          {
            code: { coding: [{ system: "http://loinc.org", code: "8462-4", display: "Diastolic blood pressure" }] },
            valueQuantity: { value: v.value2, unit: v.unit, system: "http://unitsofmeasure.org", code: "mm[Hg]" },
          },
        ],
      });
    } else {
      push({ ...base, valueQuantity: { value: v.value, unit: v.unit } });
    }
  }

  for (const im of rec.immunizations)
    push({
      resourceType: "Immunization",
      id: im.id,
      status: "completed",
      vaccineCode: { text: im.vaccine },
      patient: patientRef,
      occurrenceDateTime: im.administeredOn,
      protocolApplied: im.doseNumber != null ? [{ doseNumberPositiveInt: im.doseNumber }] : undefined,
      note: im.notes ? [{ text: im.notes }] : undefined,
    });

  for (const pr of rec.procedures) {
    const notes = [pr.outcome, pr.notes].filter(Boolean) as string[];
    push({
      resourceType: "Procedure",
      id: pr.id,
      status: "completed",
      code: { text: pr.name },
      subject: patientRef,
      performedDateTime: pr.performedOn,
      note: notes.length ? notes.map((t) => ({ text: t })) : undefined,
    });
  }

  for (const ap of rec.appointments)
    push({
      resourceType: "Appointment",
      id: ap.id,
      status: APPT_STATUS[ap.status],
      description: ap.title,
      start: ap.scheduledFor,
      comment: [ap.clinician, ap.facility, ap.reason, ap.notes].filter(Boolean).join(" · ") || undefined,
    });

  for (const d of rec.documents)
    push({
      resourceType: "DocumentReference",
      id: d.id,
      status: "current",
      type: { text: DOCUMENT_TYPE_LABELS[d.docType] },
      subject: patientRef,
      date: d.uploadedAt,
      description: d.title,
      content: [
        { attachment: { title: d.fileName, contentType: d.mimeType, size: d.fileSize, creation: d.documentDate } },
      ],
    });

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    meta: {
      tag: [
        {
          system: "https://myhealthlog.app/fhir/tag",
          code: "phr-export",
          display: "myHealthLog personal health record export",
        },
      ],
    },
    entry: entries,
  };
}

/* ------------------------------------------------- clinical summary (HTML) -- */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

const STATUS_WORD: Record<"low" | "normal" | "high", string> = {
  low: "Low",
  normal: "In range",
  high: "High",
};

/** Latest reading per measure, most-recent first — the numbers a clinician skims. */
function latestVitals(vitals: VitalReading[]): VitalReading[] {
  const groups = new Map<string, VitalReading[]>();
  for (const v of vitals) {
    const key = v.vitalType === "CUSTOM" ? `CUSTOM:${(v.label ?? "").trim().toLowerCase()}` : v.vitalType;
    const arr = groups.get(key);
    if (arr) arr.push(v);
    else groups.set(key, [v]);
  }
  return Array.from(groups.values())
    .map((arr) => [...arr].sort((a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt))[0])
    .sort((a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt));
}

function summarySection(title: string, body: string): string {
  if (!body) return "";
  return `<section><h2>${esc(title)}</h2>${body}</section>`;
}

/**
 * The context a summary is being generated through, when one is open. Everything in it
 * is read from the same record — the label, the dates, and the records the profile
 * prioritises — so the summary never becomes a second, separately-maintained account of
 * the patient.
 */
export interface SummaryFocus {
  /** What the record is being read through: "Asthma", "Pregnancy". */
  label: string;
  /** One line of context, e.g. "26 weeks 2 days pregnant · due 12 Jan 2027". */
  detail?: string;
  /** The records the profile brings forward, in priority order. */
  highlights: Array<{ title: string; meta?: string }>;
  /** How many records the profile isn't showing — stated rather than left implied. */
  others?: number;
}

function focusBlock(focus: SummaryFocus): string {
  const items = focus.highlights.length
    ? `<ul>${focus.highlights
        .map(
          (h) =>
            `<li><strong>${esc(h.title)}</strong>${
              h.meta ? ` <span class="muted">${esc(h.meta)}</span>` : ""
            }</li>`,
        )
        .join("")}</ul>`
    : "";
  const rest =
    focus.others && focus.others > 0
      ? `<p class="muted">Priority view only — ${focus.others} more ${
          focus.others === 1 ? "record" : "records"
        } remain on the full record.</p>`
      : "";
  return `<p><strong>${esc(focus.label)}</strong>${
    focus.detail ? ` — ${esc(focus.detail)}` : ""
  }</p>${items}${rest}`;
}

/** Build a self-contained, print-friendly one-page clinical summary. */
export function buildClinicalSummary(rec: RecordSnapshot, focus?: SummaryFocus): string {
  const p = rec.profile;
  const age = calcAge(p.dateOfBirth);
  const idLine = [
    age != null ? `${age} yrs` : null,
    p.sex ? SEX_LABELS[p.sex] : null,
    p.bloodType ? `Blood ${p.bloodType}` : null,
    p.genotype ? `Genotype ${p.genotype}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const critical = rec.allergies.filter((a) => isCriticalAllergy(a.severity));
  const activeConditions = rec.conditions.filter((c) => c.status === "ACTIVE");
  const activeMeds = rec.medications.filter((m) => m.active);
  const contacts = [...p.emergencyContacts].sort((a, b) => a.priority - b.priority);
  const vitals = latestVitals(rec.vitals);

  const criticalBanner = critical.length
    ? `<div class="alert"><strong>Life-threatening allergies</strong><div class="chips">${critical
        .map((a) => `<span class="chip danger">${esc(a.substance)}</span>`)
        .join("")}</div></div>`
    : "";

  const problems = activeConditions.length
    ? `<ul>${activeConditions
        .map(
          (c) =>
            `<li><strong>${esc(c.name)}</strong>${
              c.severity ? ` — ${esc(SEVERITY_LABELS[c.severity])}` : ""
            }${c.onsetDate ? ` <span class="muted">since ${esc(formatDate(c.onsetDate))}</span>` : ""}</li>`,
        )
        .join("")}</ul>`
    : "";

  const meds = activeMeds.length
    ? `<ul>${activeMeds
        .map(
          (m) =>
            `<li><strong>${esc(m.name)}</strong> ${esc(m.dosage)}<span class="muted"> — ${esc(
              m.frequency,
            )}</span></li>`,
        )
        .join("")}</ul>`
    : "";

  const allergies = rec.allergies.length
    ? `<ul>${rec.allergies
        .map(
          (a) =>
            `<li><strong>${esc(a.substance)}</strong> <span class="muted">${esc(
              ALLERGY_SEVERITY_LABELS[a.severity],
            )}${a.reactions?.length ? ` — ${esc(a.reactions.join(", "))}` : ""}</span></li>`,
        )
        .join("")}</ul>`
    : "";

  const numbers = vitals.length
    ? `<table><tbody>${vitals
        .map((v) => {
          const status = vitalStatus(v);
          const tag = status ? `<span class="status ${status}">${STATUS_WORD[status]}</span>` : "";
          return `<tr><th>${esc(vitalName(v))}</th><td>${esc(formatVitalValue(v))} ${tag}</td><td class="muted">${esc(
            formatDate(v.measuredAt),
          )}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : "";

  const contactList = contacts.length
    ? `<ul>${contacts
        .map(
          (c, i) =>
            `<li><strong>${esc(c.name)}</strong> <span class="muted">${esc(c.relationship)}${
              c.phone ? ` — ${esc(c.phone)}` : ""
            }</span>${i === 0 ? ' <span class="chip">Primary</span>' : ""}</li>`,
        )
        .join("")}</ul>`
    : "";

  const generated = new Date();
  const generatedLabel = `${formatDate(generated.toISOString())}, ${generated
    .getHours()
    .toString()
    .padStart(2, "0")}:${generated.getMinutes().toString().padStart(2, "0")}`;

  const body = [
    focus ? summarySection("In focus right now", focusBlock(focus)) : "",
    summarySection("Active problems", problems),
    summarySection("Current medicines", meds),
    summarySection("Allergies", allergies),
    summarySection("Latest measurements", numbers),
    summarySection("Emergency contacts", contactList),
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Clinical summary — ${esc(p.fullName)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px; background: #f0ece2; color: #23201c;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .page { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; border-bottom: 2px solid #c65a3a; padding-bottom: 14px; }
  h1 { margin: 0; font-size: 24px; letter-spacing: -0.01em; }
  .id { margin: 4px 0 0; color: #6b6459; font-size: 14px; }
  .stamp { color: #8a8478; font-size: 12px; text-align: right; }
  .brand { color: #c65a3a; font-weight: 700; }
  section { margin-top: 22px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #8a8478; margin: 0 0 8px; }
  ul { margin: 0; padding-left: 18px; }
  li { margin: 4px 0; }
  .muted { color: #6b6459; }
  table { width: 100%; border-collapse: collapse; }
  td, th { text-align: left; padding: 5px 0; vertical-align: top; }
  table th { font-weight: 600; width: 45%; }
  .alert { margin-top: 18px; background: #fbe9e6; border: 1px solid #e7b7ad; border-radius: 12px; padding: 12px 14px; color: #a02a16; }
  .chips { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-block; background: #efe9dd; color: #4a4438; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
  .chip.danger { background: #a02a16; color: #fff; }
  .status { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 700; margin-left: 4px; }
  .status.normal { background: #e3f0e4; color: #2f6d3b; }
  .status.high, .status.low { background: #fbe9e6; color: #a02a16; }
  footer { margin-top: 26px; border-top: 1px solid #e6e0d4; padding-top: 12px; color: #8a8478; font-size: 12px; }
  @media print {
    body { background: #fff; padding: 0; }
    .page { box-shadow: none; border-radius: 0; max-width: none; padding: 0; }
  }
</style>
</head>
<body>
  <main class="page">
    <header>
      <div>
        <h1>${esc(p.fullName)}</h1>
        ${idLine ? `<p class="id">${esc(idLine)}</p>` : ""}
      </div>
      <div class="stamp"><span class="brand">myHealthLog</span><br/>Summary · ${esc(generatedLabel)}</div>
    </header>
    ${criticalBanner}
    ${body || '<section><p class="muted">No records on file yet.</p></section>'}
    <footer>Generated from a personal health record. Confirm against clinical records before acting on it.</footer>
  </main>
</body>
</html>`;
}

/* ------------------------------------------------------------- downloads -- */

function triggerDownload(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function downloadFhirBundle(rec: RecordSnapshot): void {
  triggerDownload(
    `myhealthlog-fhir-${stamp()}.json`,
    "application/fhir+json",
    JSON.stringify(buildFhirBundle(rec), null, 2),
  );
}

export function downloadClinicalSummary(rec: RecordSnapshot, focus?: SummaryFocus): void {
  triggerDownload(
    `myhealthlog-summary-${stamp()}.html`,
    "text/html;charset=utf-8",
    buildClinicalSummary(rec, focus),
  );
}

/** Non-empty record categories with their counts, for "Includes …" copy. */
export function recordCounts(rec: RecordSnapshot): { label: string; n: number }[] {
  return [
    { label: "allergies", n: rec.allergies.length },
    { label: "medications", n: rec.medications.length },
    { label: "conditions", n: rec.conditions.length },
    { label: "measurements", n: rec.vitals.length },
    { label: "appointments", n: rec.appointments.length },
    { label: "documents", n: rec.documents.length },
    { label: "immunisations", n: rec.immunizations.length },
    { label: "procedures", n: rec.procedures.length },
  ].filter((x) => x.n > 0);
}
