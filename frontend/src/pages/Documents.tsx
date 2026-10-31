import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { DOCUMENT_TYPE_LABELS, type DocumentType, type HealthDocument } from "@/types/health";
import { formatDate, formatFileSize } from "@/lib/format";
import {
  documentToDraft,
  validateDocument,
  documentFromDraft,
  type DocumentDraft,
  type FieldErrors,
} from "@/components/records/model";
import {
  DocumentFields,
  ImagingFields,
  LabResultFields,
} from "@/components/records/FieldSets";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModeHint } from "@/components/modes/ModeHint";
import { buttonStyles } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import {
  DocumentIcon,
  EditIcon,
  EyeIcon,
  PillIcon,
  PlusIcon,
  ScanIcon,
  SearchIcon,
  ShareIcon,
  TrashIcon,
} from "@/components/icons";
import { cn } from "@/lib/cn";

/** Most recent first, by the date on the document when known, else when it was added. */
function docDate(d: HealthDocument): string {
  return d.documentDate ?? d.uploadedAt;
}

/** The five document kinds, in reading order: results and scans lead, since
    they're the two things most often looked for; "other" catches the rest. */
const TYPE_ORDER: DocumentType[] = [
  "LAB_RESULT",
  "SCAN",
  "PRESCRIPTION",
  "DISCHARGE_SUMMARY",
  "OTHER",
];

/** How each kind is drawn: the glyph on the card's coral disc. The kind's name
    always rides beside it in words, so a card never depends on colour alone. */
const TYPE_STYLES: Record<DocumentType, { Icon: typeof DocumentIcon }> = {
  LAB_RESULT: { Icon: DocumentIcon },
  PRESCRIPTION: { Icon: PillIcon },
  SCAN: { Icon: ScanIcon },
  DISCHARGE_SUMMARY: { Icon: DocumentIcon },
  OTHER: { Icon: DocumentIcon },
};

const typeStyle = (docType: DocumentType) => TYPE_STYLES[docType] ?? TYPE_STYLES.OTHER;

/** The label under the file size: "PDF", "JPEG" — or the format's own name when
    the mime type is missing. */
function fileFormat(doc: HealthDocument): string {
  const mime = doc.mimeType?.split("/").pop();
  if (mime) return mime.toUpperCase();
  const ext = doc.fileName.split(".").pop();
  return ext && ext !== doc.fileName ? ext.toUpperCase() : "FILE";
}

/** Who produced the document, when we know: the lab, the imaging centre, or
    whoever typed it in. Falls back to the kind's own name so the line is never
    blank. */
function docSource(doc: HealthDocument): string {
  if (doc.docType === "LAB_RESULT") return doc.labName?.trim() || doc.fileName;
  if (doc.docType === "SCAN") {
    return doc.provider?.trim() || imagingLine(doc) || doc.fileName;
  }
  return doc.provider?.trim() || doc.fileName;
}

/** The modality and body area, as one readable line — "MRI · Left knee". */
function imagingLine(doc: HealthDocument): string {
  return [doc.imagingType, doc.bodyArea].filter(Boolean).join("  ·  ");
}

/** Group headings use the plural — they label a shelf, not one card. */
const GROUP_LABELS: Record<DocumentType, string> = {
  LAB_RESULT: "Lab results",
  SCAN: "Imaging",
  PRESCRIPTION: "Prescriptions",
  DISCHARGE_SUMMARY: "Discharge summaries",
  OTHER: "Other documents",
};

/** The filters across the top. "All" is always present and always first. */
const FILTERS: { id: DocumentType | "ALL"; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "LAB_RESULT", label: "Lab results" },
  { id: "SCAN", label: "Imaging" },
  { id: "PRESCRIPTION", label: "Prescriptions" },
  { id: "DISCHARGE_SUMMARY", label: "Discharge" },
  { id: "OTHER", label: "Other" },
];

/** The filter a URL asks for. Anything unknown falls back to showing everything,
    so a mangled link still lands on a working page. */
function filterFromParam(value: string | null): DocumentType | "ALL" {
  if (!value) return "ALL";
  return TYPE_ORDER.includes(value as DocumentType) ? (value as DocumentType) : "ALL";
}

/** The edit form for each kind. A lab result opens the lab form, a scan opens
    the imaging form; everything else opens the general document form. */
const EDIT_FIELDS: Record<DocumentType, typeof DocumentFields> = {
  LAB_RESULT: LabResultFields,
  SCAN: ImagingFields,
  PRESCRIPTION: DocumentFields,
  DISCHARGE_SUMMARY: DocumentFields,
  OTHER: DocumentFields,
};

/** "Lab result" reads well after "Edit"; this trims the longer shared label. */
function editNoun(docType: DocumentType): string {
  return docType === "SCAN" ? "imaging" : DOCUMENT_TYPE_LABELS[docType].toLowerCase();
}

/** One document, as a card: the file's identity at the top, the facts in the
    middle, the actions along the bottom. The whole card is not a link — the
    actions inside it are, so a tap never triggers two things at once. */
function DocumentItem({
  document,
  canEdit,
  onEdit,
  onDelete,
  onShare,
}: {
  document: HealthDocument;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  const { Icon } = typeStyle(document.docType);
  const typeLabel = DOCUMENT_TYPE_LABELS[document.docType];
  const scanDetails = document.docType === "SCAN" ? imagingLine(document) : "";

  return (
    <li
      className={cn(
        "mhl-card-enter group relative flex flex-col overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface shadow-mhl transition-shadow duration-200 hover:shadow-mhl-lg focus-within:shadow-mhl-lg",
      )}
    >
      {/* The disc carries the kind's glyph; the label beside the title names it
          in words, so the kind never depends on colour alone. */}
      <div className="flex items-start gap-3.5 p-5">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
          <Icon size={21} />
        </span>

        <div className="min-w-0 flex-1">
          <Link
            to={`/app/records/documents/${document.id}`}
            className="block rounded-mhl-sm focus-visible:outline-2"
          >
            <h3 className="truncate text-[0.99rem] font-semibold leading-snug text-mhl-ink">
              {document.title}
            </h3>
          </Link>
          <p className="mt-0.5 truncate text-[0.845rem] text-mhl-muted">{docSource(document)}</p>
        </div>

        {canEdit && (
          <div className="flex flex-none items-center gap-0.5">
            <IconButton label={`Edit ${document.title}`} onClick={onEdit}>
              <EditIcon size={18} />
            </IconButton>
            <IconButton label={`Delete ${document.title}`} tone="danger" onClick={onDelete}>
              <TrashIcon size={18} />
            </IconButton>
          </div>
        )}
      </div>

      {/* The facts, on one line: when it was done, what it is, how big it is. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-5 text-[0.845rem] text-mhl-muted">
        <span className="[font-variant-numeric:tabular-nums]">
          {formatDate(docDate(document))}
        </span>
        <span aria-hidden="true" className="h-3 w-px bg-mhl-rule" />
        <span>
          {fileFormat(document)} · {formatFileSize(document.fileSize)}
        </span>
        <span className="ml-auto">
          <Tag tone="neutral">{typeLabel}</Tag>
        </span>
      </div>

      {/* A scan leads with its modality and body area, then the report's first
          lines. Other documents lead with their own notes. */}
      {document.docType === "SCAN" && (scanDetails || document.findings) && (
        <div className="mx-5 mt-3 rounded-mhl-sm bg-mhl-sunk px-3.5 py-3">
          {scanDetails && (
            <p className="text-mhl-fine font-semibold text-mhl-ink">{scanDetails}</p>
          )}
          {document.findings && (
            <p className={cn("line-clamp-2 text-mhl-fine text-mhl-muted", scanDetails && "mt-1")}>
              {document.findings}
            </p>
          )}
        </div>
      )}

      {document.docType !== "SCAN" && document.notes && (
        <p className="mt-3 line-clamp-2 px-5 text-mhl-fine text-mhl-muted">{document.notes}</p>
      )}

      {/* Actions sit on their own row so each keeps a 44px tap target. */}
      <div className="mt-auto flex flex-wrap items-center gap-2 px-5 pb-5 pt-4">
        <Link
          to={`/app/records/documents/${document.id}`}
          className={cn(buttonStyles("secondary", "md"), "flex-1")}
        >
          <EyeIcon size={18} />
          View {document.docType === "SCAN" ? "scan" : document.docType === "LAB_RESULT" ? "result" : "document"}
        </Link>
        <button type="button" onClick={onShare} className={buttonStyles("ghost", "md")}>
          <ShareIcon size={18} /> Share
        </button>
      </div>
    </li>
  );
}

export default function Documents() {
  const { canEdit } = useCareProxy();
  const { documents, updateItem, removeItem } = useRecords();
  const [searchParams, setSearchParams] = useSearchParams();
  const [edit, setEdit] = useState<{ record: HealthDocument; draft: DocumentDraft } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [del, setDel] = useState<HealthDocument | null>(null);
  const [query, setQuery] = useState("");

  // The filter lives in the URL, so /app/documents?type=LAB_RESULT opens straight
  // on lab results and the old /app/lab-results link lands somewhere real.
  const filter = filterFromParam(searchParams.get("type"));

  function chooseFilter(next: DocumentType | "ALL") {
    if (next === filter) return;
    const params = new URLSearchParams(searchParams);
    if (next === "ALL") params.delete("type");
    else params.set("type", next);
    setSearchParams(params, { replace: true });
  }

  /** The documents that match the search box and the kind filter, newest first
      within each kind. */
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents
      .filter((d) => (filter === "ALL" ? true : d.docType === filter))
      .filter((d) => {
        if (!q) return true;
        return [
          d.title,
          d.notes,
          d.fileName,
          d.labName,
          d.provider,
          d.imagingType,
          d.bodyArea,
          d.findings,
          DOCUMENT_TYPE_LABELS[d.docType],
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q));
      })
      .sort((a, b) => +new Date(docDate(b)) - +new Date(docDate(a)));
  }, [documents, filter, query]);

  /** Grouped by kind, in the reading order above. A group with no documents is
      left out entirely. */
  const groups = useMemo(
    () =>
      TYPE_ORDER.map((type) => ({
        type,
        label: GROUP_LABELS[type],
        items: matching.filter((d) => d.docType === type),
      })).filter((g) => g.items.length > 0),
    [matching],
  );

  function save() {
    if (!edit) return;
    const errs = validateDocument(edit.draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    updateItem("documents", edit.record.id, documentFromDraft(edit.draft, edit.record));
    setEdit(null);
  }

  /** Sharing a document hands over a link to its detail page; the file itself is
      opened in the browser, so there is nothing to attach here. */
  async function share(doc: HealthDocument) {
    const url = `${window.location.origin}/app/records/documents/${doc.id}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: doc.title, text: `${doc.title} — myHealthLog`, url });
        return;
      }
      await navigator.clipboard?.writeText(url);
    } catch {
      /* dismissed or unavailable — nothing to do */
    }
  }

  const hasAny = documents.length > 0;
  const labCount = documents.filter((d) => d.docType === "LAB_RESULT").length;
  const scanCount = documents.filter((d) => d.docType === "SCAN").length;
  const summary = [
    `${documents.length} ${documents.length === 1 ? "document" : "documents"}`,
    labCount > 0 ? `${labCount} lab ${labCount === 1 ? "result" : "results"}` : null,
    scanCount > 0 ? `${scanCount} ${scanCount === 1 ? "scan" : "scans"}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const adminBlock = canEdit ? (
    <Link to="/app/add" className={buttonStyles("primary", "md")}>
      <PlusIcon size={18} strokeWidth={2.25} />
      Add document
    </Link>
  ) : undefined;

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle={
          hasAny ? summary : "Lab results, scans, prescriptions and letters, kept in one place."
        }
        action={adminBlock}
      />
      <ModeHint page="documents" />

      {!hasAny ? (
        <EmptyState
          icon={<DocumentIcon size={22} />}
          title="No documents yet"
          description="Keep a lab result or a scan here, so it's with you at your next appointment."
          action={
            canEdit ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/app/add?type=lab" className={buttonStyles("primary", "md")}>
                  <PlusIcon size={18} strokeWidth={2.25} />
                  Add lab result
                </Link>
                <Link to="/app/add?type=imaging" className={buttonStyles("secondary", "md")}>
                  <ScanIcon size={18} />
                  Add imaging
                </Link>
              </div>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Search and kind filters. The search box takes the space; the
              filters are pills that stay a fixed size. */}
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[0.7rem] border border-mhl-rule bg-mhl-surface px-3.5 text-mhl-faint transition-colors focus-within:border-mhl-accent/60 focus-within:ring-1 focus-within:ring-mhl-accent/30 sm:w-72 sm:flex-none">
              <span className="sr-only">Search documents</span>
              <SearchIcon size={18} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search titles, labs, imaging…"
                className="min-w-0 flex-1 border-0 bg-transparent text-mhl-body text-mhl-ink outline-none placeholder:text-mhl-faint"
              />
            </label>

            <div
              role="group"
              aria-label="Filter documents by kind"
              className="-mx-1 flex flex-wrap gap-2 px-1"
            >
              {FILTERS.map((f) => {
                const count =
                  f.id === "ALL"
                    ? documents.length
                    : documents.filter((d) => d.docType === f.id).length;
                const active = filter === f.id;
                // An empty kind is noise in the filter row — unless a link sent
                // us straight to it, in which case the active pill stays put.
                if (f.id !== "ALL" && count === 0 && !active) return null;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => chooseFilter(f.id)}
                    aria-pressed={active}
                    aria-label={`${f.label}: ${count} ${count === 1 ? "document" : "documents"}`}
                    className={cn(
                      "mhl-interactive flex min-h-11 items-center rounded-full border px-4 text-mhl-fine font-semibold transition-colors",
                      active
                        ? "border-mhl-accent bg-mhl-accent text-white"
                        : "border-mhl-rule bg-mhl-surface text-mhl-ink hover:border-mhl-faint",
                    )}
                  >
                    {f.label}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "ml-2 rounded-full px-1.5 py-0.5 text-[0.72rem] font-semibold leading-none",
                        active ? "bg-white/20 text-white" : "bg-mhl-sunk text-mhl-muted",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {groups.length === 0 ? (
            <EmptyState
              icon={<SearchIcon size={28} />}
              title="Nothing matches that"
              description="Try a different word, or clear the search to see everything."
              action={
                <button
                  type="button"
                  className={buttonStyles("secondary", "md")}
                  onClick={() => {
                    setQuery("");
                    chooseFilter("ALL");
                  }}
                >
                  Clear search
                </button>
              }
            />
          ) : (
            <div className={filter === "ALL" ? "space-y-8" : undefined}>
              {groups.map((group) => (
                <section key={group.type}>
                  {/* When the page is filtered to one kind, the active pill already
                      names it — a second heading would just repeat itself. */}
                  {filter === "ALL" && (
                    <h2 className="mb-3 text-mhl-card font-bold text-mhl-ink">{group.label}</h2>
                  )}

                  {/* One column on a phone, two on a tablet, three on a desktop —
                      the cards stay wide enough for their facts to read. */}
                  <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((d) => (
                      <DocumentItem
                        key={d.id}
                        document={d}
                        canEdit={canEdit}
                        onEdit={() => {
                          setEdit({ record: d, draft: documentToDraft(d) });
                          setErrors({});
                        }}
                        onDelete={() => setDel(d)}
                        onShare={() => void share(d)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <RecordEditModal<DocumentDraft>
        open={edit !== null}
        title={edit ? `Edit ${editNoun(edit.record.docType)}` : "Edit document"}
        draft={edit?.draft ?? null}
        errors={errors}
        Fields={edit ? EDIT_FIELDS[edit.record.docType] : DocumentFields}
        onChange={(patch) => setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))}
        onSave={save}
        onClose={() => setEdit(null)}
      />

      <ConfirmDialog
        open={del !== null}
        title="Delete this document?"
        message={del ? `${del.title} will be removed from your record.` : ""}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (del) removeItem("documents", del.id);
        }}
        onClose={() => setDel(null)}
      />
    </div>
  );
}
