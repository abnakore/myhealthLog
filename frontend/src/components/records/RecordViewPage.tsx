import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useRecords } from "@/store/RecordsContext";
import type { CollectionKey, Collections } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModeHint, type ModeHintPage } from "@/components/modes/ModeHint";
import { Card } from "@/components/ui/Card";
import { buttonStyles } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/Modal";
import { RecordDetailView } from "./RecordDetailView";
import { RecordEditModal } from "./RecordEditModal";
import { documentKindFor, findKind, findKindByRoute, type RecordKind } from "./registry";
import {
  medicationToDraft,
  conditionToDraft,
  allergyToDraft,
  appointmentToDraft,
  documentToDraft,
  vitalToDraft,
} from "./model";
import { EditIcon, TrashIcon, ArrowLeftIcon } from "@/components/icons";
import { formatRelative } from "@/lib/format";
import {
  DOCUMENT_TYPE_LABELS,
  type Allergy,
  type Appointment,
  type Condition,
  type HealthDocument,
  type Immunization,
  type Medication,
  type VitalReading,
} from "@/types/health";

type RecordItem = Allergy | Appointment | Condition | HealthDocument | Immunization | Medication | VitalReading;

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

/** The record's own name for the delete confirmation — title, name, substance,
 *  vaccine or label, whichever this kind calls it. */
function deletedRecordName(record: RecordItem, fallback: string): string {
  if ("title" in record) return record.title || fallback;
  if ("name" in record) return record.name || fallback;
  if ("substance" in record) return record.substance || fallback;
  if ("vaccine" in record) return record.vaccine || fallback;
  if ("label" in record) return record.label || fallback;
  return fallback;
}

/** The date a record is "about", for the page subtitle. Each kind files it under
 *  its own field name, so we ask each in turn for the first one it carries. */
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

export default function RecordViewPage() {
  const { type, id } = useParams();
  const { canEdit } = useCareProxy();
  const store = useRecords();
  const navigate = useNavigate();
  // The route segment names the list ("medications"), so resolve it to the kind
  // that owns that list.
  const routeKind = findKindByRoute(type ?? null);

  const [edit, setEdit] = useState<RecordItem | null>(null);
  const [del, setDel] = useState<RecordItem | null>(null);
  const [draft, setDraft] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const record = findRecord(store, routeKind?.collectionKey, id ?? "");
  // Documents share one list and one route, but a lab result and a scan are not
  // generic documents: their own kind decides the title, the detail layout and
  // the edit form. Other kinds already are their own record type.
  const kind =
    record && "docType" in record
      ? findKind(documentKindFor((record as HealthDocument).docType)) ?? routeKind
      : routeKind;

  if (!kind || !record) {
    return (
      <div className="max-w-[42rem] mx-auto px-4 py-10">
        <PageHeader title="Record not found" subtitle="The record you're looking for doesn't exist." />
        <Card className="text-center py-12">
          <p className="text-mhl-body text-mhl-muted">We couldn't find that record.</p>
          <div className="mt-6">
            <Link to="/app" className={buttonStyles("primary", "md")}>
              <ArrowLeftIcon size={18} strokeWidth={2.25} /> Back to home
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const detailPath = `/app/records/${kind.routeKey}/${record.id}`;
  // A document's own kind names the page: "Prescription" is more useful than
  // the generic "Document", just as "Imaging" beats "Document" for a scan.
  const recordLabel =
    "docType" in record
      ? DOCUMENT_TYPE_LABELS[(record as HealthDocument).docType]
      : kind.label;
  const when = recordDate(record);
  const subtitle = when ? `${recordLabel} · ${formatRelative(when)}` : recordLabel;
  // The record stores ids; the view names the conditions rather than showing
  // raw ids to the person reading their own file.
  const relatedConditions =
    "conditionIds" in record && Array.isArray(record.conditionIds)
      ? record.conditionIds
          .map((conditionId) => store.conditions.find((c) => c.id === conditionId)?.name)
          .filter((name): name is string => Boolean(name))
      : [];

  // An arrow (not a hoisted declaration) so the `kind`/`record` narrowing above
  // still applies inside it.
  const save = () => {
    if (!edit) return;
    const errs = kind.validate(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    // The registry erased the concrete record type at this boundary; the kind's
    // own builder still returns the right collection item.
    store.updateItem(kind.collectionKey, record.id, kind.fromDraft(draft, record) as never);
    setEdit(null);
    setDraft(null);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const seedDraft = (r: RecordItem) => {
    setDraft(DRAFT_SEEDERS[kind.kind](r));
  };

  return (
    <div className="max-w-[42rem] mx-auto px-4 py-6">
      <PageHeader
        title={recordLabel}
        subtitle={subtitle}
        action={
          canEdit ? (
            <div className="flex items-center gap-2">
              <IconButton label={`Edit ${recordLabel}`} onClick={() => { seedDraft(record); setEdit(record); }}>
                <EditIcon size={18} />
              </IconButton>
              <IconButton label={`Delete ${recordLabel}`} tone="danger" onClick={() => setDel(record)}>
                <TrashIcon size={18} />
              </IconButton>
            </div>
          ) : undefined
        }
      />
      <ModeHint page={kind.routeKey as ModeHintPage} />

      <RecordDetailView
        record={record}
        detailPath={detailPath}
        backTo={kind.listPath}
        relatedConditions={relatedConditions}
        onShare={(path) => {
          navigator.clipboard.writeText(path);
        }}
        justSaved={saved}
      />

      {canEdit && (
        <RecordEditModal
          open={edit !== null}
          title={`Edit ${recordLabel}`}
          draft={draft ?? null}
          errors={errors}
          Fields={kind.Fields}
          onChange={(patch) =>
            setDraft((prev: unknown) => ({ ...(prev as object | null), ...(patch as object) }))
          }
          onSave={save}
          onClose={() => { setEdit(null); setDraft(null); setErrors({}); setSaved(false); }}
          saveLabel="Save changes"
        />
      )}

      <ConfirmDialog
        open={del !== null}
        title={"docType" in record ? "Delete this document?" : `Delete this ${kind.label}?`}
        message={
          del
            ? `${deletedRecordName(del, kind.label)} will be removed from your record.`
            : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (del) store.removeItem(kind.collectionKey, del.id);
          navigate(kind.listPath);
        }}
        onClose={() => setDel(null)}
      />
    </div>
  );
}