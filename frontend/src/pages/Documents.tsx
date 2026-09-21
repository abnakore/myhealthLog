import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { DOCUMENT_TYPE_LABELS, type HealthDocument } from "@/types/health";
import { formatDate, formatFileSize } from "@/lib/format";
import {
  documentToDraft,
  validateDocument,
  documentFromDraft,
  type DocumentDraft,
  type FieldErrors,
} from "@/components/records/model";
import { DocumentFields } from "@/components/records/FieldSets";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { buttonStyles } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { DocumentIcon, EditIcon, PlusIcon, ScanIcon, TrashIcon } from "@/components/icons";

/** Most recent first, by the date on the document when known, else when it was added. */
function docDate(d: HealthDocument): string {
  return d.documentDate ?? d.uploadedAt;
}

export default function Documents() {
  const { canEdit } = useCareProxy();
  const { documents, updateItem, removeItem } = useRecords();
  const [edit, setEdit] = useState<{ record: HealthDocument; draft: DocumentDraft } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [del, setDel] = useState<HealthDocument | null>(null);

  const sorted = useMemo(
    () => [...documents].sort((a, b) => +new Date(docDate(b)) - +new Date(docDate(a))),
    [documents],
  );

  function save() {
    if (!edit) return;
    const errs = validateDocument(edit.draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    updateItem("documents", edit.record.id, documentFromDraft(edit.draft, edit.record));
    setEdit(null);
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle={
          documents.length === 0
            ? "Lab results, scans, prescriptions and letters, kept in one place."
            : `${documents.length} ${documents.length === 1 ? "file" : "files"} on file`
        }
        action={
          canEdit ? (
            <Link to="/app/add?type=lab" className={buttonStyles("primary", "md")}>
              <PlusIcon size={18} strokeWidth={2.25} />
              Add document
            </Link>
          ) : undefined
        }
      />

      {documents.length === 0 ? (
        <EmptyState
          icon={<DocumentIcon size={28} />}
          title="No documents yet"
          description="Upload a lab result or scan so it's with you at your next appointment."
          action={
            canEdit ? (
              <Link to="/app/add?type=lab" className={buttonStyles("primary", "md")}>
                <PlusIcon size={18} strokeWidth={2.25} />
                Add a document
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-mhl-rule">
            {sorted.map((d) => {
              const Icon = d.docType === "SCAN" ? ScanIcon : DocumentIcon;
              const meta = [formatFileSize(d.fileSize), formatDate(docDate(d))].filter(Boolean);
              return (
                <li key={d.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-mhl-body font-semibold text-mhl-ink">{d.title}</p>
                      <Tag tone="neutral">{DOCUMENT_TYPE_LABELS[d.docType]}</Tag>
                    </div>
                    <p className="truncate text-mhl-fine text-mhl-muted">{meta.join("  ·  ")}</p>
                  </div>
                  {canEdit && (
                    <div className="flex flex-none items-center">
                      <IconButton
                        label={`Edit ${d.title}`}
                        onClick={() => {
                          setEdit({ record: d, draft: documentToDraft(d) });
                          setErrors({});
                        }}
                      >
                        <EditIcon size={18} />
                      </IconButton>
                      <IconButton label={`Delete ${d.title}`} tone="danger" onClick={() => setDel(d)}>
                        <TrashIcon size={18} />
                      </IconButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <RecordEditModal<DocumentDraft>
        open={edit !== null}
        title="Edit document"
        draft={edit?.draft ?? null}
        errors={errors}
        Fields={DocumentFields}
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
