// A read-only, polished presentation of one health record. Each record type knows
// how to present itself; documents go further and show the facts that belong to
// their own kind (a lab report's lab and date, an imaging report's modality and
// findings).
//
// Share and Back live beside the title; editing and deleting stay in the page
// header, so the record page never shows the same action twice.
import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { ArrowLeftIcon, CheckIcon, ShareIcon } from "@/components/icons";
import { Confetti } from "@/components/ui/Confetti";
import {
  formatDate,
  formatDateTime,
  formatFileSize,
  formatRelative,
} from "@/lib/format";
import {
  DOCUMENT_TYPE_LABELS,
  VITAL_LABELS,
  type Allergy,
  type Appointment,
  type Condition,
  type HealthDocument,
  type Immunization,
  type Medication,
  type VitalReading,
} from "@/types/health";

/** Every record shape the shared view can present. */
export type DisplayRecord =
  | Allergy
  | Appointment
  | Condition
  | HealthDocument
  | Immunization
  | Medication
  | VitalReading;

/** Narrows a record to one shape by a field only that shape carries. The return
 *  type is written per-guard (below) rather than derived, because the union has
 *  no single "the field that marks this kind" type to extract. */
function hasField(v: unknown, field: string): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<string, unknown>)[field] !== undefined
  );
}

function isMedication(v: unknown): v is Medication {
  // `dosage` is required on a medication and on nothing else.
  return hasField(v, "dosage");
}

function isAllergy(v: unknown): v is Allergy {
  return hasField(v, "substance");
}

function isAppointment(v: unknown): v is Appointment {
  return hasField(v, "scheduledFor");
}

function isImmunization(v: unknown): v is Immunization {
  return hasField(v, "vaccine");
}

function isVital(v: unknown): v is VitalReading {
  return hasField(v, "value");
}

function isDocument(v: unknown): v is HealthDocument {
  return hasField(v, "docType");
}

function isCondition(v: unknown): v is Condition {
  // A condition shares `status` with an appointment and `name` with a medication,
  // so it is told apart by what it is *not*: every other kind has already claimed
  // its own marker by the time this runs.
  return (
    hasField(v, "status") &&
    hasField(v, "name") &&
    !hasField(v, "dosage") &&
    !hasField(v, "substance") &&
    !hasField(v, "scheduledFor")
  );
}

function RecordTitle(record: DisplayRecord): string {
  if (isImmunization(record)) return record.vaccine || "Immunization";
  if (isMedication(record)) return record.name || "Medication";
  if (isCondition(record)) return record.name || "Condition";
  if (isAllergy(record)) return record.substance || "Allergy";
  if (isAppointment(record)) return record.title || "Appointment";
  if (isDocument(record)) return record.title || "Document";
  if (isVital(record)) return record.label || "Reading";
  return "Record";
}

function RecordCaption(record: DisplayRecord): string {
  if (isImmunization(record)) {
    return `Vaccine: ${record.vaccine} · ${record.doseNumber} dose given ${record.administeredOn ? formatDate(record.administeredOn) : ""}`;
  }
  if (isMedication(record)) {
    const meta = [record.dosage, record.frequency, record.form, record.route].filter(Boolean);
    return meta.join(" · ");
  }
  if (isCondition(record)) {
    const parts = [record.severity, record.onsetDate ? `since ${formatDate(record.onsetDate)}` : null]
      .filter(Boolean) as string[];
    return parts.join("  ·  ") || "On file";
  }
  if (isAllergy(record)) {
    const date = record.firstReactionDate ? `first reaction ${formatDate(record.firstReactionDate)}` : "";
    return [record.allergyType, record.severity, date].filter(Boolean).join(" · ");
  }
  if (isAppointment(record)) {
    return `${record.status} · ${formatDateTime(record.scheduledFor)}`;
  }
  if (isDocument(record)) {
    const kind = DOCUMENT_TYPE_LABELS[record.docType];
    const source = record.labName ?? record.provider ?? "";
    const when = record.documentDate
      ? formatDate(record.documentDate)
      : record.uploadedAt
        ? formatRelative(record.uploadedAt)
        : "";
    return [kind, source, when].filter(Boolean).join("  ·  ");
  }
  if (isVital(record)) {
    const label = VITAL_LABELS[record.vitalType] || record.vitalType;
    return `${label} · ${record.measuredAt ? formatRelative(record.measuredAt) : ""}`;
  }
  return "On file";
}

function RecordFields(record: DisplayRecord): [string, string][] {
  const fields: [string, string][] = [];
  if (isMedication(record)) {
    if (record.dosage) fields.push(["Dosage", record.dosage]);
    if (record.form) fields.push(["Form", record.form]);
    if (record.route) fields.push(["Route", record.route]);
    if (record.frequency) fields.push(["How often", record.frequency]);
    if (record.duration) fields.push(["Duration", record.duration]);
    if (record.startDate) fields.push(["Started", formatDate(record.startDate)]);
    if (record.endDate) fields.push(["Ended", formatDate(record.endDate)]);
    if (record.prescriber) fields.push(["Prescriber", record.prescriber]);
    if (record.reason) fields.push(["Reason", record.reason]);
  } else if (isCondition(record)) {
    if (record.severity) fields.push(["Severity", record.severity]);
    if (record.onsetDate) fields.push(["Onset", formatDate(record.onsetDate)]);
    if (record.resolvedDate) fields.push(["Resolved", formatDate(record.resolvedDate)]);
    if (record.icd10Code) fields.push(["ICD-10", record.icd10Code]);
    if (record.diagnosedBy) fields.push(["Diagnosed by", record.diagnosedBy]);
    if (record.source) fields.push(["Source", record.source]);
  } else if (isAllergy(record)) {
    if (record.allergyType) fields.push(["Type", record.allergyType]);
    if (record.severity) fields.push(["Severity", record.severity]);
    if (record.firstReactionDate) fields.push(["First reaction", formatDate(record.firstReactionDate)]);
    if (record.reactions && record.reactions.length) fields.push(["Reactions", record.reactions.join(", ")]);
    if (record.triggers && record.triggers.length) fields.push(["Triggers", record.triggers.join(", ")]);
    if (record.isVerified) fields.push(["Verified", "Yes"]);
    if (record.source) fields.push(["Source", record.source]);
  } else if (isAppointment(record)) {
    if (record.title) fields.push(["Title", record.title]);
    if (record.status) fields.push(["Status", record.status]);
    if (record.scheduledFor) fields.push(["Scheduled", formatDateTime(record.scheduledFor)]);
    if (record.clinician) fields.push(["Clinician", record.clinician]);
    if (record.facility) fields.push(["Facility", record.facility]);
    if (record.reason) fields.push(["Reason", record.reason]);
  } else if (isDocument(record)) {
    // Each document kind shows the facts that matter for it, not a pile of
    // fields from the other kinds. The report itself gets its own block below.
    if (record.docType === "LAB_RESULT") {
      if (record.labName) fields.push(["Lab", record.labName]);
      if (record.documentDate) fields.push(["Report date", formatDate(record.documentDate)]);
      if (record.uploadedAt) fields.push(["Added", formatDateTime(record.uploadedAt)]);
      if (record.fileName) fields.push(["File", record.fileName]);
      if (record.fileSize) fields.push(["Size", formatFileSize(record.fileSize)]);
    } else if (record.docType === "SCAN") {
      if (record.imagingType) fields.push(["Imaging", record.imagingType]);
      if (record.bodyArea) fields.push(["Body area", record.bodyArea]);
      if (record.provider) fields.push(["Imaging centre", record.provider]);
      if (record.documentDate) fields.push(["Report date", formatDate(record.documentDate)]);
      if (record.uploadedAt) fields.push(["Added", formatDateTime(record.uploadedAt)]);
      if (record.fileName) fields.push(["File", record.fileName]);
      if (record.fileSize) fields.push(["Size", formatFileSize(record.fileSize)]);
    } else {
      fields.push(["Kind", DOCUMENT_TYPE_LABELS[record.docType]]);
      if (record.documentDate) fields.push(["Date on document", formatDate(record.documentDate)]);
      if (record.uploadedAt) fields.push(["Added", formatDateTime(record.uploadedAt)]);
      if (record.provider) fields.push(["Provider", record.provider]);
      if (record.fileName) fields.push(["File", record.fileName]);
      if (record.fileSize) fields.push(["Size", formatFileSize(record.fileSize)]);
    }
  } else if (isVital(record)) {
    if (record.vitalType) fields.push(["Type", VITAL_LABELS[record.vitalType] || record.vitalType]);
    if (record.label) fields.push(["Label", record.label]);
    if (record.value !== undefined) fields.push(["Value", `${record.value} ${record.unit || ""}`].filter(Boolean) as [string, string]);
    if (record.value2 !== undefined) fields.push(["Secondary", `${record.value2} ${record.unit || ""}`]);
    if (record.context) fields.push(["Context", record.context]);
    if (record.measuredAt) fields.push(["Measured", formatDateTime(record.measuredAt)]);
  } else if (isImmunization(record)) {
    if (record.vaccine) fields.push(["Vaccine", record.vaccine]);
    if (record.doseNumber) fields.push(["Dose", `${record.doseNumber} dose`]);
    if (record.administeredOn) fields.push(["Given at", formatDate(record.administeredOn)]);
    if (record.nextDue) fields.push(["Next due", formatDate(record.nextDue)]);
  }
  return fields;
}

function RecordNotes(record: DisplayRecord): string | null {
  if (isMedication(record) && record.notes) return record.notes;
  if (isCondition(record) && record.notes) return record.notes;
  if (isAllergy(record) && record.notes) return record.notes;
  if (isAppointment(record) && record.notes) return record.notes;
  if (isDocument(record) && record.notes) return record.notes;
  if (isVital(record) && record.notes) return record.notes;
  if (isImmunization(record) && record.notes) return record.notes;
  return null;
}

interface RecordActionsProps {
  detailPath?: string;
  backTo?: string;
  onShare?: (path: string) => void;
}

/** Share and the way back to the list. Editing and deleting live in the page
    header, so this bar doesn't repeat them. */
function RecordActions({ detailPath, backTo, onShare }: RecordActionsProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!detailPath || !onShare) return;
    onShare(detailPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-none items-center gap-1.5">
      {detailPath && onShare && (
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 py-2 text-mhl-body font-semibold transition-colors",
            copied
              ? "bg-mhl-good-lo text-mhl-good"
              : "bg-mhl-surface text-mhl-ink hover:bg-mhl-sunk",
          )}
          aria-label={copied ? "Link copied" : "Share this record"}
        >
          {copied ? <CheckIcon size={17} /> : <ShareIcon size={17} />}
          {copied ? "Copied" : "Share"}
        </button>
      )}
      {backTo && (
        <Link
          to={backTo}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-mhl-rule bg-mhl-surface px-3.5 py-2 text-mhl-body font-semibold text-mhl-ink transition-colors hover:bg-mhl-sunk"
        >
          <ArrowLeftIcon size={17} />
          Back
        </Link>
      )}
    </div>
  );
}

interface RecordDetailViewProps<T extends DisplayRecord> {
  record: T;
  detailPath?: string;
  /** Where the Back action returns to — the list the record came from. */
  backTo?: string;
  onShare?: (detailPath: string) => void;
  subtitle?: string;
  /** Display names of the conditions this record was linked to. */
  relatedConditions?: string[];
  as?: "div" | "article";
  /** When true, plays a confetti burst once (e.g. right after saving). */
  justSaved?: boolean;
}

/** The shared read-only display block for a single record. Presents every field
 *  the record carries, with chips, notes, and a polished action bar. */
export function RecordDetailView<T extends DisplayRecord>({
  record,
  detailPath,
  backTo,
  onShare,
  subtitle,
  relatedConditions,
  justSaved = false,
  as: Tag = "article",
  ...rest
}: RecordDetailViewProps<T>) {
  return (
    <Tag {...rest} className="mt-2">
      {justSaved && <Confetti active />}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-mhl-answer font-bold text-mhl-ink">
                {RecordTitle(record)}
              </h2>
              <p className="mt-1 text-mhl-fine text-mhl-muted">
                {subtitle ?? RecordCaption(record)}
              </p>
            </div>
            <RecordActions detailPath={detailPath} backTo={backTo} onShare={onShare} />
          </div>

          <div className="mt-5 rounded-mhl-sm border border-mhl-rule bg-mhl-sunk p-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {RecordFields(record).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[0.79rem] font-medium text-mhl-muted">{label}</dt>
                  <dd className="mt-0.5 text-[0.95rem] font-semibold text-mhl-ink [text-wrap:pretty]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* A scan's report is the substance of the record, so it gets room to
              read rather than a truncated cell in the facts grid. */}
          {isDocument(record) && record.docType === "SCAN" && record.findings && (
            <section className="mt-4 rounded-mhl-sm border border-mhl-rule bg-mhl-surface p-4">
              <h3 className="text-[0.79rem] font-semibold text-mhl-muted">Report</h3>
              <p className="mt-1 whitespace-pre-line text-mhl-body text-mhl-ink">
                {record.findings}
              </p>
            </section>
          )}

          {relatedConditions && relatedConditions.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-mhl-fine font-semibold text-mhl-muted">Related to</span>
              {relatedConditions.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-mhl-rule bg-mhl-surface px-2.5 py-0.5 text-mhl-fine font-semibold text-mhl-ink"
                >
                  {name}
                </span>
              ))}
            </div>
          )}

          {RecordNotes(record) && (
            <div className="mt-4">
              <h3 className="text-[0.79rem] font-semibold text-mhl-muted">Notes</h3>
              <p className="mt-1 whitespace-pre-line text-mhl-body leading-relaxed text-mhl-ink">
                {RecordNotes(record)}
              </p>
            </div>
          )}
        </div>
      </div>
    </Tag>
  );
}
