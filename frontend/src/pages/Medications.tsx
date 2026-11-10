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
import { ModeHint } from "@/components/modes/ModeHint";
import { Section } from "@/components/ui/Section";
import { buttonStyles } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { ChevronRightIcon, EditIcon, PillIcon, PlusIcon, TrashIcon } from "@/components/icons";

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
              <PlusIcon size={18} strokeWidth={2.5} />
              Add medication
            </Link>
          ) : undefined
        }
      />
      <ModeHint page="medications" />

      {medications.length === 0 ? (
        <EmptyState
          icon={<PillIcon size={22} />}
          title="No medications yet"
          description="Add anything you take regularly. The dose and how often is enough to start."
          action={
            canEdit ? (
              <Link to="/app/add?type=medication" className={buttonStyles("primary", "md")}>
                <PlusIcon size={18} strokeWidth={2.5} />
                Add a medication
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Section
          icon={<PillIcon size={18} />}
          question="What you take"
          lead="Current medicines first, then what you've stopped. Flip a switch to move one."
        >
          <ul className="mt-3">
            {sorted.map((m) => {
              const meta = [m.dosage, m.frequency, m.prescriber].filter(Boolean);
              const timing = m.active
                ? m.startDate
                  ? `Since ${formatDate(m.startDate)}`
                  : "Currently taking"
                : m.endDate
                  ? `Stopped ${formatDate(m.endDate)}`
                  : "No longer taking";
              return (
                <li key={m.id} className="group/row border-t border-mhl-rule first:border-t-0">
                  <div className="flex min-w-0 items-center gap-2 py-3.5">
                    <Link
                      to={`/app/records/medications/${m.id}`}
                      className="group flex min-w-0 flex-1 items-center gap-3.5 rounded-mhl-sm"
                    >
                      <span
                        className={cn(
                          "grid h-11 w-11 flex-none place-items-center rounded-full",
                          m.active
                            ? "bg-mhl-accent-lo text-mhl-accent"
                            : "bg-mhl-sunk text-mhl-faint",
                        )}
                      >
                        <PillIcon size={21} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className={cn(
                              "text-[0.99rem] font-semibold text-mhl-ink",
                              !m.active && "text-mhl-muted",
                            )}
                          >
                            {m.name}
                          </span>
                          {!m.active && (
                            <span className="text-[0.8rem] font-medium text-mhl-faint">Past</span>
                          )}
                        </span>
                        {meta.length > 0 && (
                          <span className="mt-0.5 block truncate text-[0.845rem] text-mhl-muted">
                            {meta.join(" · ")}
                          </span>
                        )}
                        <span className="mt-0.5 block truncate text-[0.845rem] text-mhl-faint">
                          {timing}
                        </span>
                      </span>
                      <span className="flex-none text-mhl-faint transition-colors group-hover:text-mhl-accent">
                        <ChevronRightIcon size={17} />
                      </span>
                    </Link>
                    <div className="flex flex-none flex-col items-center gap-1">
                      {/* Marking a medicine current or past is a write — a view-only proxy
                          sees the state without being able to flip it. */}
                      <Switch
                        checked={m.active}
                        onChange={(active) => updateItem("medications", m.id, { active })}
                        label={`Mark ${m.name} as ${m.active ? "past" : "current"}`}
                        disabled={!canEdit}
                      />
                      <span className="text-[0.68rem] font-medium text-mhl-faint">
                        {m.active ? "Active" : "Past"}
                      </span>
                    </div>
                    {canEdit && (
                      <div className="flex flex-none items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
                        <IconButton
                          label={`Edit ${m.name}`}
                          onClick={() => {
                            setEdit({ record: m, draft: medicationToDraft(m) });
                            setErrors({});
                          }}
                        >
                          <EditIcon size={17} />
                        </IconButton>
                        <IconButton
                          label={`Delete ${m.name}`}
                          tone="danger"
                          onClick={() => setDel(m)}
                        >
                          <TrashIcon size={17} />
                        </IconButton>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <RecordEditModal<MedicationDraft>
        open={edit !== null}
        title="Edit medication"
        draft={edit?.draft ?? null}
        errors={errors}
        Fields={MedicationFields}
        onChange={(patch) =>
          setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))
        }
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
