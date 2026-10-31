import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import {
  CONDITION_STATUS_LABELS,
  SEVERITY_LABELS,
  type Condition,
  type ConditionStatus,
} from "@/types/health";
import { formatDate, yearOf } from "@/lib/format";
import {
  conditionToDraft,
  validateCondition,
  conditionFromDraft,
  type ConditionDraft,
  type FieldErrors,
} from "@/components/records/model";
import { ConditionFields } from "@/components/records/FieldSets";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModeHint } from "@/components/modes/ModeHint";
import { Section } from "@/components/ui/Section";
import { buttonStyles } from "@/components/ui/Button";
import { Tag, conditionTone } from "@/components/ui/Tag";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import {
  ChevronRightIcon,
  ConditionIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";

/** Active conditions first, then those in remission, then resolved. */
const STATUS_RANK: Record<ConditionStatus, number> = {
  ACTIVE: 2,
  IN_REMISSION: 1,
  RESOLVED: 0,
};

export default function Conditions() {
  const { canEdit } = useCareProxy();
  const { conditions, updateItem, removeItem } = useRecords();
  const [edit, setEdit] = useState<{ record: Condition; draft: ConditionDraft } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [del, setDel] = useState<Condition | null>(null);

  const sorted = [...conditions].sort(
    (a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status],
  );
  const activeCount = conditions.filter((c) => c.status === "ACTIVE").length;

  function save() {
    if (!edit) return;
    const errs = validateCondition(edit.draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    updateItem("conditions", edit.record.id, conditionFromDraft(edit.draft, edit.record));
    setEdit(null);
  }

  return (
    <div>
      <PageHeader
        title="Conditions"
        subtitle={
          conditions.length === 0
            ? "Ongoing diagnoses and things you're managing."
            : `${conditions.length} on file · ${activeCount} being treated`
        }
        action={
          canEdit ? (
            <Link to="/app/add?type=condition" className={buttonStyles("primary", "md")}>
              <PlusIcon size={18} strokeWidth={2.5} />
              Add condition
            </Link>
          ) : undefined
        }
      />
      <ModeHint page="conditions" />

      {conditions.length === 0 ? (
        <EmptyState
          icon={<ConditionIcon size={22} />}
          title="No conditions recorded"
          description="Add anything a clinician is treating or keeping an eye on."
          action={
            canEdit ? (
              <Link to="/app/add?type=condition" className={buttonStyles("primary", "md")}>
                <PlusIcon size={18} strokeWidth={2.5} />
                Add a condition
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Section
          icon={<ConditionIcon size={18} />}
          question="What you're managing"
          lead="Active conditions lead, then those in remission, then resolved."
        >
          <ul className="mt-3">
            {sorted.map((c) => {
              const timing =
                c.status === "RESOLVED" && c.resolvedDate
                  ? `Resolved ${formatDate(c.resolvedDate)}`
                  : c.onsetDate
                    ? `Since ${yearOf(c.onsetDate)}`
                    : null;
              const meta = [
                c.severity ? SEVERITY_LABELS[c.severity] : null,
                timing,
              ].filter(Boolean);
              return (
                <li key={c.id} className="group/row border-t border-mhl-rule first:border-t-0">
                  <div className="flex min-w-0 items-center gap-2 py-3.5">
                    <Link
                      to={`/app/records/conditions/${c.id}`}
                      className="group flex min-w-0 flex-1 items-center gap-3.5 rounded-mhl-sm"
                    >
                      <span
                        className={cn(
                          "grid h-11 w-11 flex-none place-items-center rounded-full",
                          c.status === "ACTIVE"
                            ? "bg-mhl-accent-lo text-mhl-accent"
                            : "bg-mhl-sunk text-mhl-muted",
                        )}
                      >
                        <ConditionIcon size={21} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[0.99rem] font-semibold text-mhl-ink">
                            {c.name}
                          </span>
                          <Tag tone={conditionTone(c.status)}>
                            {CONDITION_STATUS_LABELS[c.status]}
                          </Tag>
                        </span>
                        {meta.length > 0 && (
                          <span className="mt-0.5 block truncate text-[0.845rem] text-mhl-muted">
                            {meta.join(" · ")}
                          </span>
                        )}
                        {c.notes && (
                          <span className="mt-0.5 line-clamp-1 block text-[0.845rem] text-mhl-faint">
                            {c.notes}
                          </span>
                        )}
                      </span>
                      <span className="flex-none text-mhl-faint transition-colors group-hover:text-mhl-accent">
                        <ChevronRightIcon size={17} />
                      </span>
                    </Link>
                    {/* Write controls are the page's permission, not the row's. */}
                    {canEdit && (
                      <div className="flex flex-none items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
                        <IconButton
                          label={`Edit ${c.name}`}
                          onClick={() => {
                            setEdit({ record: c, draft: conditionToDraft(c) });
                            setErrors({});
                          }}
                        >
                          <EditIcon size={17} />
                        </IconButton>
                        <IconButton
                          label={`Delete ${c.name}`}
                          tone="danger"
                          onClick={() => setDel(c)}
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

      <RecordEditModal<ConditionDraft>
        open={edit !== null}
        title="Edit condition"
        draft={edit?.draft ?? null}
        errors={errors}
        Fields={ConditionFields}
        onChange={(patch) =>
          setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))
        }
        onSave={save}
        onClose={() => setEdit(null)}
      />

      <ConfirmDialog
        open={del !== null}
        title="Delete this condition?"
        message={del ? `${del.name} will be removed from your record.` : ""}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (del) removeItem("conditions", del.id);
        }}
        onClose={() => setDel(null)}
      />
    </div>
  );
}
