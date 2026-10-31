import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import {
  ALLERGY_TYPE_LABELS,
  ALLERGY_SEVERITY_LABELS,
  isCriticalAllergy,
  type Allergy,
  type AllergySeverity,
} from "@/types/health";
import { formatDate } from "@/lib/format";
import {
  allergyToDraft,
  validateAllergy,
  allergyFromDraft,
  type AllergyDraft,
  type FieldErrors,
} from "@/components/records/model";
import { AllergyFields } from "@/components/records/FieldSets";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModeHint } from "@/components/modes/ModeHint";
import { Section } from "@/components/ui/Section";
import { buttonStyles } from "@/components/ui/Button";
import { Tag, allergyTone } from "@/components/ui/Tag";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import {
  AllergyIcon,
  CheckIcon,
  ChevronRightIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";

/** Most dangerous first, so the emergency-relevant ones lead the list. */
const SEVERITY_RANK: Record<AllergySeverity, number> = {
  ANAPHYLAXIS: 3,
  SEVERE: 2,
  MODERATE: 1,
  MILD: 0,
};

export default function Allergies() {
  const { canEdit } = useCareProxy();
  const { allergies, updateItem, removeItem } = useRecords();
  const [edit, setEdit] = useState<{ record: Allergy; draft: AllergyDraft } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [del, setDel] = useState<Allergy | null>(null);

  const sorted = [...allergies].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
  const criticalCount = allergies.filter((a) => isCriticalAllergy(a.severity)).length;

  function save() {
    if (!edit) return;
    const errs = validateAllergy(edit.draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    updateItem("allergies", edit.record.id, allergyFromDraft(edit.draft, edit.record));
    setEdit(null);
  }

  return (
    <div>
      <PageHeader
        title="Allergies"
        subtitle={
          allergies.length === 0
            ? "The reactions that matter most in an emergency."
            : criticalCount > 0
              ? `${allergies.length} on file · ${criticalCount} ${criticalCount === 1 ? "needs" : "need"} urgent care`
              : `${allergies.length} on file`
        }
        action={
          canEdit ? (
            <Link to="/app/add?type=allergy" className={buttonStyles("primary", "md")}>
              <PlusIcon size={18} strokeWidth={2.5} />
              Add allergy
            </Link>
          ) : undefined
        }
      />
      <ModeHint page="allergies" />

      {allergies.length === 0 ? (
        <EmptyState
          icon={<AllergyIcon size={22} />}
          title="No allergies recorded"
          description="Add anything you react to — a drug, a food, or something in the environment."
          action={
            canEdit ? (
              <Link to="/app/add?type=allergy" className={buttonStyles("primary", "md")}>
                <PlusIcon size={18} strokeWidth={2.5} />
                Add an allergy
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Section
          icon={<AllergyIcon size={18} />}
          question="Everything you react to"
          lead={
            criticalCount > 0
              ? "Most serious first. The life-threatening ones also show on your emergency card."
              : "Most serious first. Nothing here is flagged as life-threatening."
          }
        >
          <ul className="mt-3">
            {sorted.map((a) => {
              const critical = isCriticalAllergy(a.severity);
              const meta = [
                ALLERGY_TYPE_LABELS[a.allergyType],
                a.reactions && a.reactions.length > 0 ? a.reactions.join(", ") : null,
                a.firstReactionDate ? `since ${formatDate(a.firstReactionDate)}` : null,
              ].filter(Boolean);
              return (
                <li
                  key={a.id}
                  className="group/row border-t border-mhl-rule first:border-t-0"
                >
                  <div className="flex min-w-0 items-center gap-2 py-3.5">
                    <Link
                      to={`/app/records/allergies/${a.id}`}
                      className="group flex min-w-0 flex-1 items-center gap-3.5 rounded-mhl-sm"
                    >
                      <span
                        className={cn(
                          "grid h-11 w-11 flex-none place-items-center rounded-full",
                          critical
                            ? "bg-mhl-danger-lo text-mhl-danger"
                            : "bg-mhl-accent-lo text-mhl-accent",
                        )}
                      >
                        <AllergyIcon size={21} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[0.99rem] font-semibold text-mhl-ink">
                            {a.substance}
                          </span>
                          <Tag tone={allergyTone(a.severity)}>
                            {ALLERGY_SEVERITY_LABELS[a.severity]}
                          </Tag>
                          {a.isVerified && (
                            <span className="inline-flex items-center gap-1 text-[0.8rem] text-mhl-muted">
                              <CheckIcon size={13} strokeWidth={2.5} />
                              Confirmed
                            </span>
                          )}
                        </span>
                        {meta.length > 0 && (
                          <span className="mt-0.5 block truncate text-[0.845rem] text-mhl-muted">
                            {meta.join(" · ")}
                          </span>
                        )}
                        {a.notes && (
                          <span className="mt-0.5 line-clamp-1 block text-[0.845rem] text-mhl-faint">
                            {a.notes}
                          </span>
                        )}
                      </span>
                      <span className="flex-none text-mhl-faint transition-colors group-hover:text-mhl-accent">
                        <ChevronRightIcon size={17} />
                      </span>
                    </Link>
                    {/* The row's write controls. A view-only proxy reads the list and
                        never sees these — the permission is the page's, not the row's. */}
                    {canEdit && (
                      <div className="flex flex-none items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
                        <IconButton
                          label={`Edit ${a.substance}`}
                          onClick={() => {
                            setEdit({ record: a, draft: allergyToDraft(a) });
                            setErrors({});
                          }}
                        >
                          <EditIcon size={17} />
                        </IconButton>
                        <IconButton
                          label={`Delete ${a.substance}`}
                          tone="danger"
                          onClick={() => setDel(a)}
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

      <RecordEditModal<AllergyDraft>
        open={edit !== null}
        title="Edit allergy"
        draft={edit?.draft ?? null}
        errors={errors}
        Fields={AllergyFields}
        onChange={(patch) =>
          setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))
        }
        onSave={save}
        onClose={() => setEdit(null)}
      />

      <ConfirmDialog
        open={del !== null}
        title="Delete this allergy?"
        message={
          del ? `${del.substance} will be removed from your record and your emergency card.` : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (del) removeItem("allergies", del.id);
        }}
        onClose={() => setDel(null)}
      />
    </div>
  );
}
