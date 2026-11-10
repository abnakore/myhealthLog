/**
 * One record, full page — the same page for every kind of record.
 *
 * Medications, conditions, allergies, visits, readings and documents all open
 * here and share one structure, taken from the document page:
 *
 *   1. Header — the record's name, what it is and when, Edit / Delete
 *   2. Back to the list it came from
 *   3. The attached file, previewed inline (PDF / image) with Open + Download
 *   4. AI analysis of that file — status, summary, findings, medicines,
 *      conditions, follow-up — polled live while the worker reads it
 *   5. Details — every fact on the record, who added it, related conditions, notes
 *
 * Any record can carry its own supporting document, so every record gets the
 * file and AI sections; a record without a file says so and offers to attach one.
 *
 * Reached at /app/records/<list>/<id> (and /app/records/documents/<id>).
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useRecords } from "@/store/RecordsContext";
import type { CollectionKey, Collections } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModeHint, type ModeHintPage } from "@/components/modes/ModeHint";
import { Card } from "@/components/ui/Card";
import { Button, buttonStyles } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { Tag } from "@/components/ui/Tag";
import { Confetti } from "@/components/ui/Confetti";
import { RecordFields, RecordNotes, RecordTitle } from "./RecordDetailView";
import { RecordEditModal } from "./RecordEditModal";
import { RecordReviewPanel } from "./RecordReviewPanel";
import { applyReviewFix, type ReviewMismatch } from "@/services/records";
import { documentKindFor, findKind, findKindByRoute, type RecordKind } from "./registry";
import {
  medicationToDraft,
  conditionToDraft,
  allergyToDraft,
  appointmentToDraft,
  documentToDraft,
  vitalToDraft,
} from "./model";
import {
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  CopilotIcon,
  DownloadIcon,
  EditIcon,
  EyeIcon,
  InfoIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatFileSize } from "@/lib/format";
import { api, apiErrorMessage } from "@/services/api";
import { retryExtraction } from "@/services/records";
import {
  DOCUMENT_TYPE_LABELS,
  type AiExtractionResult,
  type AiExtractionStatus,
  type AiKeyFinding,
  type Allergy,
  type Appointment,
  type Condition,
  type HealthDocument,
  type Immunization,
  type Medication,
  type Provenance,
  type VitalReading,
} from "@/types/health";

type RecordItem = Allergy | Appointment | Condition | HealthDocument | Immunization | Medication | VitalReading;

/** The file + AI fields every record shares (HealthDocument names them the same). */
interface FileFacts {
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  aiExtraction?: AiExtractionResult | null;
  aiExtractionStatus?: AiExtractionStatus;
}

/** Each kind's record-to-draft adapter. The registry erases the concrete type at
 *  its boundary, so this one table restores it before a draft is seeded. */
const DRAFT_SEEDERS: Record<RecordKind, (record: RecordItem) => unknown> = {
  medication: (record) => medicationToDraft(record as Medication),
  condition: (record) => conditionToDraft(record as Condition),
  allergy: (record) => allergyToDraft(record as Allergy),
  visit: (record) => appointmentToDraft(record as Appointment),
  document: (record) => documentToDraft(record as HealthDocument),
  vital: (record) => vitalToDraft(record as VitalReading),
  lab: (record) => documentToDraft(record as HealthDocument),
  imaging: (record) => documentToDraft(record as HealthDocument),
};

/** The REST path for each collection — the same names the API uses. */
const API_PATH: Partial<Record<CollectionKey, string>> = {
  allergies: "allergies",
  medications: "medications",
  conditions: "conditions",
  appointments: "appointments",
  documents: "documents",
  vitals: "vitals",
};

/** The date a record is "about", for the page subtitle. */
function recordDate(r: RecordItem): string {
  const any = r as unknown as Record<string, unknown>;
  for (const field of [
    "documentDate",
    "uploadedAt",
    "administeredOn",
    "scheduledFor",
    "onsetDate",
    "firstReactionDate",
    "startDate",
    "measuredAt",
  ]) {
    const value = any[field];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function findRecord(
  collections: Collections,
  collectionKey: CollectionKey | undefined,
  id: string,
): RecordItem | null {
  if (!collectionKey) return null;
  const list = collections[collectionKey] as unknown as RecordItem[] | undefined;
  return (list ?? []).find((r) => r.id === id) ?? null;
}

function previewKind(file: FileFacts): "image" | "pdf" | null {
  const mime = file.mimeType ?? "";
  const name = (file.fileName ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/.test(name)) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return null;
}

function withDownload(url: string): string {
  return url + (url.includes("?") ? "&" : "?") + "download=1";
}

/* ------------------------------------------------------------- sections -- */

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-mhl border border-mhl-rule bg-mhl-surface p-5", className)}>
      {children}
    </div>
  );
}

function FileCard({
  file,
  title,
  onAttach,
}: {
  file: FileFacts;
  title: string;
  onAttach?: () => void;
}) {
  if (!file.fileUrl) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-mhl border border-dashed border-mhl-rule bg-mhl-sunk px-4 py-8 text-center">
        <p className="text-mhl-body text-mhl-muted">
          {file.fileName
            ? "The file isn't available. It may have been removed from the server."
            : "No supporting document is attached to this record."}
        </p>
        {onAttach && (
          <Button variant="secondary" icon={<UploadIcon size={18} />} onClick={onAttach}>
            Attach a file
          </Button>
        )}
      </div>
    );
  }

  const kind = previewKind(file);
  return (
    <div className="overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mhl-rule px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-mhl-fine font-semibold text-mhl-ink">{file.fileName ?? "Attached file"}</p>
          <p className="text-mhl-fine text-mhl-muted">
            {[
              file.fileSize ? formatFileSize(file.fileSize) : null,
              file.mimeType ? file.mimeType.split("/").pop()?.toUpperCase() : null,
            ]
              .filter(Boolean)
              .join(" · ") || "File"}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <a
            href={file.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-mhl-accent px-3 py-1.5 text-mhl-fine font-semibold text-white hover:bg-mhl-accent-strong"
          >
            <EyeIcon size={15} />
            Open full document
          </a>
          <a
            href={withDownload(file.fileUrl)}
            className="inline-flex items-center gap-1.5 rounded-full border border-mhl-rule px-3 py-1.5 text-mhl-fine font-semibold text-mhl-ink hover:bg-mhl-sunk"
          >
            <DownloadIcon size={15} />
            Download
          </a>
        </div>
      </div>

      {kind === "image" && (
        <img src={file.fileUrl} alt={title} className="max-h-[70vh] w-full bg-mhl-sunk object-contain p-4" />
      )}
      {kind === "pdf" && (
        <iframe
          src={file.fileUrl}
          title={title}
          className="h-[70vh] w-full border-0"
          aria-label={`Preview of ${title}`}
        />
      )}
      {kind === null && (
        <div className="flex flex-col items-center gap-3 py-12 text-mhl-muted">
          <p className="text-mhl-body">Preview not available for this file type.</p>
          <a
            href={withDownload(file.fileUrl)}
            className="text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
          >
            Download the file
          </a>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: AiExtractionStatus }) {
  const map: Partial<Record<AiExtractionStatus, { label: string; icon: ReactNode; className: string }>> = {
    PENDING: { label: "Queued for analysis", icon: <ClockIcon size={14} />, className: "text-mhl-muted" },
    PROCESSING: { label: "Analysing…", icon: <Spinner size={14} />, className: "text-mhl-accent" },
    DONE: { label: "Analysis complete", icon: <CheckIcon size={14} />, className: "text-mhl-good" },
    FAILED: { label: "Analysis failed", icon: <InfoIcon size={14} />, className: "text-mhl-danger" },
  };
  const item = status ? map[status] : undefined;
  if (!item) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-mhl-fine font-medium", item.className)}>
      {item.icon}
      {item.label}
    </span>
  );
}

const FINDING_TONE: Record<string, string> = {
  normal: "text-mhl-good",
  low: "text-mhl-accent",
  high: "text-mhl-danger",
  critical: "text-mhl-danger font-bold",
};

function FindingRow({ finding }: { finding: AiKeyFinding }) {
  const tone = finding.status ? FINDING_TONE[finding.status] : "";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-mhl-rule py-2 last:border-0">
      <span className="min-w-0">
        <span className="text-mhl-body text-mhl-ink">{finding.metric}</span>
        {finding.reference_range && (
          <span className="block text-[0.75rem] text-mhl-faint">Range {finding.reference_range}</span>
        )}
      </span>
      <span className={cn("text-right text-mhl-body font-semibold tabular-nums", tone)}>
        {finding.value}
        {finding.unit ? ` ${finding.unit}` : ""}
        {finding.status && finding.status !== "normal" && (
          <span className={cn("ml-2 text-mhl-fine uppercase", tone)}>{finding.status}</span>
        )}
      </span>
    </div>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-mhl-fine font-semibold uppercase tracking-wide text-mhl-muted">{children}</h3>
  );
}

function AiAnalysisCard({
  file,
  canRetry,
  onRetry,
  retrying,
  retryError,
}: {
  file: FileFacts;
  canRetry: boolean;
  onRetry: () => void;
  retrying: boolean;
  retryError: string | null;
}) {
  const status = file.aiExtractionStatus;
  const extraction = file.aiExtraction;
  const done = status === "DONE" && extraction;
  const abnormal = (extraction?.key_findings ?? []).filter((f) => f.status && f.status !== "normal");

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-mhl-accent">
            <CopilotIcon size={18} />
          </span>
          <h2 className="text-mhl-card font-bold text-mhl-ink">AI analysis</h2>
        </div>
        <StatusBadge status={status} />
      </div>

      {!file.fileUrl && !file.fileName && (
        <p className="text-mhl-fine text-mhl-muted">
          Attach a supporting document, such as a prescription, a lab report or a clinic letter, and AI will
          read it and list what it found here.
        </p>
      )}

      {(status === "PENDING" || status === "PROCESSING") && (
        <div className="flex items-center gap-3 rounded-mhl-sm bg-mhl-accent-lo px-4 py-3 text-mhl-fine text-mhl-ink">
          <Spinner size={16} />
          Reading the attached file. This usually takes under a minute. This page updates by itself.
        </div>
      )}

      {(status === "FAILED" || status === "SKIPPED") && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-mhl-sm bg-mhl-danger-lo px-4 py-3 text-mhl-fine text-mhl-danger">
          <span>
            {status === "FAILED"
              ? "The AI could not read this file this time. You can still open it, or try again."
              : "AI analysis was not run for this file."}
          </span>
          {canRetry && (
            <Button variant="secondary" onClick={onRetry} disabled={retrying}>
              {retrying ? "Queuing…" : "Try again"}
            </Button>
          )}
        </div>
      )}
      {retryError && <p className="mt-2 text-mhl-fine text-mhl-danger">{retryError}</p>}

      {done && (
        <div className="space-y-5">
          {abnormal.length > 0 && (
            <div className="rounded-mhl-sm border border-mhl-danger/30 bg-mhl-danger-lo px-4 py-3 text-mhl-fine text-mhl-ink">
              <p className="font-semibold text-mhl-danger">
                {abnormal.length === 1 ? "1 result outside the normal range" : `${abnormal.length} results outside the normal range`}
              </p>
              <p className="mt-0.5">{abnormal.map((f) => f.metric).join(", ")}</p>
            </div>
          )}

          {extraction.summary && (
            <div className="rounded-mhl-sm bg-mhl-sunk px-4 py-3">
              <p className="mb-1 text-mhl-fine font-semibold text-mhl-muted">Summary</p>
              <p className="text-mhl-body text-mhl-ink">{extraction.summary}</p>
            </div>
          )}

          {extraction.key_findings && extraction.key_findings.length > 0 && (
            <div>
              <SubHeading>Key findings</SubHeading>
              <div className="overflow-hidden rounded-mhl-sm border border-mhl-rule">
                {extraction.key_findings.map((f, i) => (
                  <div key={i} className="px-4">
                    <FindingRow finding={f} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {extraction.medications_mentioned && extraction.medications_mentioned.length > 0 && (
            <div>
              <SubHeading>Medications mentioned</SubHeading>
              <ul className="space-y-1.5">
                {extraction.medications_mentioned.map((m, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-mhl-body text-mhl-ink">
                    <span className="font-semibold">{m.name}</span>
                    {(m.dosage || m.frequency) && (
                      <span className="text-mhl-fine text-mhl-muted">
                        {[m.dosage, m.frequency].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extraction.conditions_mentioned && extraction.conditions_mentioned.length > 0 && (
            <div>
              <SubHeading>Conditions mentioned</SubHeading>
              <div className="flex flex-wrap gap-2">
                {extraction.conditions_mentioned.map((c, i) => (
                  <Tag key={i} tone="neutral">
                    {c}
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {extraction.follow_up && extraction.follow_up.length > 0 && (
            <div>
              <SubHeading>Next steps on the document</SubHeading>
              <ul className="list-disc space-y-1 pl-5 text-mhl-body text-mhl-ink">
                {extraction.follow_up.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </div>
          )}

          {(extraction.provider || extraction.ordering_clinician) && (
            <div className="space-y-0.5 text-mhl-fine text-mhl-muted">
              {extraction.provider && (
                <p>
                  Issued by: <span className="font-medium text-mhl-ink">{extraction.provider}</span>
                </p>
              )}
              {extraction.ordering_clinician && (
                <p>
                  Clinician: <span className="font-medium text-mhl-ink">{extraction.ordering_clinician}</span>
                </p>
              )}
            </div>
          )}

          <p className="border-t border-mhl-rule pt-3 text-[0.72rem] text-mhl-faint">
            AI-extracted information may contain errors. Always check it against the original document.
          </p>
        </div>
      )}
    </Panel>
  );
}

function addedByLabel(provenance?: Provenance): string | null {
  if (!provenance?.addedBy) return null;
  const role =
    provenance.addedByRole === "CARE_PROVIDER"
      ? "care provider"
      : provenance.addedByRole === "CARE_PROXY"
        ? "care proxy"
        : "you";
  return `${provenance.addedBy} (${role}) · ${formatDateTime(provenance.addedAt)}`;
}

function DetailsCard({
  record,
  relatedConditions,
}: {
  record: RecordItem;
  relatedConditions: string[];
}) {
  const rows: [string, ReactNode][] = RecordFields(record).filter(
    // The file card already names the file and its size.
    ([label]) => label !== "File" && label !== "Size",
  );
  if ("docType" in record && record.findings && record.docType !== "SCAN") {
    rows.push(["Findings", record.findings]);
  }
  const added = addedByLabel((record as { provenance?: Provenance }).provenance);
  if (added) rows.push(["Added by", added]);
  if (relatedConditions.length > 0) {
    rows.push([
      "Related to",
      <span className="flex flex-wrap gap-1.5">
        {relatedConditions.map((name) => (
          <Tag key={name} tone="neutral">
            {name}
          </Tag>
        ))}
      </span>,
    ]);
  }
  const notes = RecordNotes(record);

  return (
    <Panel>
      <h2 className="mb-3 text-mhl-card font-bold text-mhl-ink">Details</h2>
      <dl className="divide-y divide-mhl-rule">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start gap-4 py-2.5">
            <dt className="w-36 flex-none text-mhl-fine text-mhl-muted">{label}</dt>
            <dd className="min-w-0 text-mhl-fine text-mhl-ink [text-wrap:pretty]">{value}</dd>
          </div>
        ))}
      </dl>
      {"docType" in record && record.docType === "SCAN" && record.findings && (
        <div className="mt-4 border-t border-mhl-rule pt-4">
          <h3 className="text-mhl-fine font-semibold text-mhl-muted">Report</h3>
          <p className="mt-1 whitespace-pre-line text-mhl-body text-mhl-ink">{record.findings}</p>
        </div>
      )}
      {notes && (
        <div className="mt-4 border-t border-mhl-rule pt-4">
          <h3 className="text-mhl-fine font-semibold text-mhl-muted">Notes</h3>
          <p className="mt-1 whitespace-pre-line text-mhl-body leading-relaxed text-mhl-ink">{notes}</p>
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------------- page -- */

export default function RecordViewPage() {
  const params = useParams();
  // /app/records/documents/:id has no :type segment.
  const type = params.type ?? "documents";
  const id = params.id ?? "";
  const { canEdit } = useCareProxy();
  const store = useRecords();
  const navigate = useNavigate();
  const routeKind = findKindByRoute(type);

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  // Live AI status fetched while the worker reads the file. It overlays the
  // store copy only while the store still shows the state it was fetched for,
  // so an edit or refresh in the store simply supersedes it.
  const [liveState, setLiveState] = useState<{ basis: string; facts: FileFacts } | null>(null);

  const record = findRecord(store, routeKind?.collectionKey, id);
  // Documents share one list and one route, but a lab result and a scan are not
  // generic documents: their own kind decides the edit form.
  const kind =
    record && "docType" in record
      ? findKind(documentKindFor((record as HealthDocument).docType)) ?? routeKind
      : routeKind;
  const apiPath = kind ? API_PATH[kind.collectionKey] : undefined;

  const baseFile = (record ?? {}) as FileFacts;
  const basis = `${baseFile.aiExtractionStatus ?? ""}|${baseFile.fileUrl ?? ""}`;
  const live = liveState && liveState.basis === basis ? liveState.facts : null;
  const setLive = (facts: FileFacts) => setLiveState({ basis, facts });
  const file: FileFacts = { ...baseFile, ...(live ?? {}) };
  const status = file.aiExtractionStatus;
  const refresh = store.refresh;
  useEffect(() => {
    if (!apiPath || !id) return;
    if (status !== "PENDING" && status !== "PROCESSING") return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const res = await api.get<{ ai_extraction: AiExtractionResult | null; ai_extraction_status: string }>(
          `/v1/records/${apiPath}/${id}/`,
        );
        if (stopped) return;
        const next = res.data.ai_extraction_status as AiExtractionStatus;
        setLiveState({ basis, facts: { aiExtractionStatus: next, aiExtraction: res.data.ai_extraction } });
        if (next !== "PENDING" && next !== "PROCESSING") {
          window.clearInterval(timer);
          void refresh();
        }
      } catch {
        /* keep polling; a transient error must not stop the page updating */
      }
    }, 4000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [apiPath, id, status, basis, refresh]);

  // Opening this URL directly (or refreshing) renders once before the record
  // collections have loaded — say so instead of claiming the record is missing.
  if (!record && !store.hasLoaded) {
    return (
      <div className="space-y-5">
        <PageHeader title="Opening record" subtitle="Loading your record…" />
        <Card className="py-12 text-center">
          <Spinner size={22} />
        </Card>
      </div>
    );
  }

  if (!kind || !record) {
    return (
      <div className="space-y-5">
        <PageHeader title="Record not found" subtitle="This record doesn't exist or has been deleted." />
        <Card className="py-12 text-center">
          <p className="text-mhl-body text-mhl-muted">We couldn't find that record.</p>
          <div className="mt-6">
            <Link to={routeKind?.listPath ?? "/app"} className={buttonStyles("primary", "md")}>
              <ArrowLeftIcon size={18} strokeWidth={2.25} /> Back to {routeKind?.listLabel.toLowerCase() ?? "home"}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const kindLabel =
    "docType" in record ? DOCUMENT_TYPE_LABELS[(record as HealthDocument).docType] : kind.label;
  const title = RecordTitle(record);
  const when = recordDate(record);
  const source =
    "labName" in record || "provider" in record
      ? ((record as HealthDocument).labName || (record as HealthDocument).provider || null)
      : null;
  const subtitle = [kindLabel, when ? formatDate(when) : null, source].filter(Boolean).join("  ·  ");
  const relatedConditions =
    "conditionIds" in record && Array.isArray(record.conditionIds)
      ? record.conditionIds
          .map((conditionId) => store.conditions.find((c) => c.id === conditionId)?.name)
          .filter((name): name is string => Boolean(name))
      : [];
  const supportsFile = Boolean(apiPath);

  const openEdit = () => {
    setDraft(DRAFT_SEEDERS[kind.kind](record));
    setErrors({});
    setSaveError(null);
    setEditing(true);
  };

  const save = async () => {
    const errs = kind.validate(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      // The registry erased the concrete record type at this boundary; the kind's
      // own builder still returns the right collection item.
      await store.updateItem(kind.collectionKey, record.id, kind.fromDraft(draft, record) as never);
      setEditing(false);
      setDraft(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setSaveError(apiErrorMessage(err));
    }
  };

  // "Use the document's value" from the record check: patch exactly the fields
  // the backend named, then reload so every page shows the corrected record.
  const applySuggestion = async (m: ReviewMismatch) => {
    if (!m.apply || !apiPath) return;
    await applyReviewFix(apiPath, record.id, m.apply);
    await store.refresh();
  };

  const retry = async () => {
    if (!apiPath) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await retryExtraction(apiPath, record.id);
      setLive({ aiExtractionStatus: "PENDING", aiExtraction: null });
    } catch (err) {
      setRetryError(apiErrorMessage(err));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-5">
      {saved && <Confetti active />}
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          canEdit ? (
            <div className="flex gap-2">
              <Button variant="secondary" icon={<EditIcon size={18} />} onClick={openEdit}>
                Edit
              </Button>
              <Button variant="danger" icon={<TrashIcon size={18} />} onClick={() => setDeleting(true)}>
                Delete
              </Button>
            </div>
          ) : undefined
        }
      />
      <ModeHint page={kind.routeKey as ModeHintPage} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={kind.listPath}
          className="inline-flex items-center gap-1.5 text-mhl-fine font-semibold text-mhl-muted hover:text-mhl-ink"
        >
          <ArrowLeftIcon size={16} />
          Back to {kind.listLabel.toLowerCase()}
        </Link>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-mhl-fine font-semibold text-mhl-good">
            <CheckIcon size={15} /> Saved
          </span>
        )}
      </div>

      <FileCard file={file} title={title} onAttach={canEdit && supportsFile ? openEdit : undefined} />

      {supportsFile && (
        <AiAnalysisCard
          file={file}
          canRetry={canEdit && Boolean(file.fileUrl)}
          onRetry={retry}
          retrying={retrying}
          retryError={retryError}
        />
      )}

      <DetailsCard record={record} relatedConditions={relatedConditions} />

      {apiPath && apiPath !== "appointments" && (
        <RecordReviewPanel
          routeKey={apiPath}
          recordId={record.id}
          basis={`${basis}|${JSON.stringify(record)}`}
          canEdit={canEdit}
          onApply={applySuggestion}
        />
      )}

      {canEdit && (
        <RecordEditModal
          open={editing}
          title={`Edit ${kindLabel.toLowerCase()}`}
          draft={draft ?? null}
          errors={saveError ? { ...errors, form: saveError } : errors}
          Fields={kind.Fields}
          onChange={(patch) =>
            setDraft((prev: unknown) => ({ ...(prev as object | null), ...(patch as object) }))
          }
          onSave={() => void save()}
          onClose={() => {
            setEditing(false);
            setDraft(null);
            setErrors({});
            setSaveError(null);
          }}
          saveLabel="Save changes"
        />
      )}

      <ConfirmDialog
        open={deleting}
        title={"docType" in record ? "Delete this document?" : `Delete this ${kind.label.toLowerCase()}?`}
        message={`"${title}" will be removed from your record${file.fileUrl ? ", along with its attached file" : ""}.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          void store.removeItem(kind.collectionKey, record.id);
          navigate(kind.listPath, { replace: true });
        }}
        onClose={() => setDeleting(false)}
      />
    </div>
  );
}
