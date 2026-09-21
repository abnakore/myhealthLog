import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import type { Medication } from "@/types/health";
import { formatDate } from "@/lib/format";
import {
  medicationToDraft,
  validateMedication,
  medicationFromDraft,
  type MedicationDraft,
  type FieldErrors,
} from "@/components/records/model";
import { MedicationFields } from "@/components/records/FieldSets";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { buttonStyles } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EditIcon, PillIcon, PlusIcon, TrashIcon } from "@/components/icons";

export default function Medications() {
  const { canEdit } = useCareProxy();
  const { medications, updateItem, removeItem } = useRecords();
  const [edit, setEdit] = useState<{ record: Medication; draft: MedicationDraft } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [del, setDel] = useState<Medication | null>(null);

  const activeCount = medications.filter((m) => m.active).length;
  // Current meds first, then alphabetical — the ones you're taking today lead.
  const sorted = [...medications].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  function save() {
    if (!edit) return;
    const errs = validateMedication(edit.draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    updateItem("medications", edit.record.id, medicationFromDraft(edit.draft, edit.record));
    setEdit(null);
  }

  return (
    <div>
      <PageHeader
        title="Medications"
        subtitle={
          medications.length === 0
            ? "What you take, and what you've taken before."
            : `${activeCount} you're taking now · ${medications.length} in total`
        }
        action={
          canEdit ? (
            <Link to="/app/add?type=medication" className={buttonStyles("primary", "md")}>
              <PlusIcon size={18} strokeWidth={2.25} />
              Add medication
            </Link>
          ) : undefined
        }
      />

      {medications.length === 0 ? (
        <EmptyState
          icon={<PillIcon size={28} />}
          title="No medications yet"
          description="Add anything you take regularly — the dose and how often is enough to start."
          action={
            canEdit ? (
              <Link to="/app/add?type=medication" className={buttonStyles("primary", "md")}>
                <PlusIcon size={18} strokeWidth={2.25} />
                Add a medication
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-mhl-rule">
            {sorted.map((m) => {
              const meta = [m.dosage, m.frequency, m.prescriber].filter(Boolean);
              return (
                <li key={m.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      "grid h-10 w-10 flex-none place-items-center rounded-full",
                      m.active ? "bg-mhl-accent-lo text-mhl-accent" : "bg-mhl-sunk text-mhl-faint",
                    )}
                  >
                    <PillIcon size={20} />
                  </span>
                  <div className={cn("min-w-0 flex-1", !m.active && "opacity-65")}>
                    <p className="truncate text-mhl-body font-semibold text-mhl-ink">{m.name}</p>
                    {meta.length > 0 && (
                      <p className="truncate text-mhl-fine text-mhl-muted">{meta.join("  ·  ")}</p>
                    )}
                    <p className="text-mhl-fine text-mhl-faint">
                      {m.active
                        ? m.startDate
                          ? `Since ${formatDate(m.startDate)}`
                          : "Currently taking"
                        : m.endDate
                          ? `Stopped ${formatDate(m.endDate)}`
                          : "No longer taking"}
                    </p>
                  </div>
                  <div className="flex flex-none flex-col items-center gap-1">
                    {/* Marking a medicine current or past is a write — a view-only proxy
                        sees the state without being able to flip it. */}
                    <Switch
                      checked={m.active}
                      onChange={(active) => updateItem("medications", m.id, { active })}
                      label={`Mark ${m.name} as ${m.active ? "past" : "current"}`}
                      disabled={!canEdit}
                    />
                    <span className="text-[0.7rem] font-medium text-mhl-faint">
                      {m.active ? "Active" : "Past"}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex flex-none items-center">
                      <IconButton
                        label={`Edit ${m.name}`}
                        onClick={() => {
                          setEdit({ record: m, draft: medicationToDraft(m) });
                          setErrors({});
                        }}
                      >
                        <EditIcon size={18} />
                      </IconButton>
                      <IconButton label={`Delete ${m.name}`} tone="danger" onClick={() => setDel(m)}>
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

      <RecordEditModal<MedicationDraft>
        open={edit !== null}
        title="Edit medication"
        draft={edit?.draft ?? null}
        errors={errors}
        Fields={MedicationFields}
        onChange={(patch) => setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))}
        onSave={save}
        onClose={() => setEdit(null)}
      />

      <ConfirmDialog
        open={del !== null}
        title="Delete this medication?"
        message={del ? `${del.name} will be removed from your record.` : ""}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (del) removeItem("medications", del.id);
        }}
        onClose={() => setDel(null)}
      />
    </div>
  );
}
