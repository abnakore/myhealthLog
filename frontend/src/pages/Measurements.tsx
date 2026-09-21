import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import {
  VITAL_LABELS,
  formatVitalValue,
  vitalName,
  vitalStatus,
  type VitalReading,
  type VitalStatus,
  type VitalType,
} from "@/types/health";
import { formatDateTime, formatRelative } from "@/lib/format";
import {
  vitalToDraft,
  validateVital,
  vitalFromDraft,
  type VitalReadingDraft,
  type FieldErrors,
} from "@/components/records/model";
import { VitalFields } from "@/components/records/FieldSets";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { buttonStyles } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { Sparkline } from "@/components/ui/Sparkline";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EditIcon, PlusIcon, TrashIcon, VitalsIcon } from "@/components/icons";

// The clinical display order, shared by the snapshot and the filter chips.
const VITAL_ORDER = Object.keys(VITAL_LABELS) as VitalType[];

const STATUS_TAG: Record<VitalStatus, { tone: TagTone; label: string }> = {
  low: { tone: "watch", label: "Low" },
  normal: { tone: "ok", label: "In range" },
  high: { tone: "watch", label: "High" },
};

// Custom readings are grouped by their name so "Ketones" and "Mood" stay apart.
function groupKeyOf(v: VitalReading): string {
  return v.vitalType === "CUSTOM" ? `CUSTOM:${(v.label ?? "").trim().toLowerCase()}` : v.vitalType;
}

function StatusTag({ reading }: { reading: VitalReading }) {
  const status = vitalStatus(reading);
  if (!status) return null;
  const { tone, label } = STATUS_TAG[status];
  return <Tag tone={tone}>{label}</Tag>;
}

export default function Measurements() {
  const { vitals, updateItem, removeItem } = useRecords();
  const [edit, setEdit] = useState<{ record: VitalReading; draft: VitalReadingDraft } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [del, setDel] = useState<VitalReading | null>(null);
  const [filter, setFilter] = useState<VitalType | "ALL">("ALL");

  // One snapshot row per thing tracked: its latest value + a trend of recent readings.
  const snapshot = useMemo(() => {
    const groups = new Map<string, VitalReading[]>();
    for (const v of vitals) {
      const key = groupKeyOf(v);
      const arr = groups.get(key);
      if (arr) arr.push(v);
      else groups.set(key, [v]);
    }
    const rows = Array.from(groups.entries()).map(([key, readings]) => {
      const chrono = [...readings].sort(
        (a, b) => +new Date(a.measuredAt) - +new Date(b.measuredAt),
      );
      return {
        key,
        latest: chrono[chrono.length - 1],
        values: chrono.slice(-20).map((r) => r.value),
      };
    });
    rows.sort(
      (a, b) => VITAL_ORDER.indexOf(a.latest.vitalType) - VITAL_ORDER.indexOf(b.latest.vitalType),
    );
    return rows;
  }, [vitals]);

  const presentTypes = useMemo(() => {
    const set = new Set(vitals.map((v) => v.vitalType));
    return VITAL_ORDER.filter((t) => set.has(t));
  }, [vitals]);

  // A filter on a type that no longer has readings falls back to showing everything.
  const activeFilter = filter !== "ALL" && presentTypes.includes(filter) ? filter : "ALL";

  const history = useMemo(() => {
    const sorted = [...vitals].sort((a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt));
    return activeFilter === "ALL" ? sorted : sorted.filter((v) => v.vitalType === activeFilter);
  }, [vitals, activeFilter]);

  function save() {
    if (!edit) return;
    const errs = validateVital(edit.draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    updateItem("vitals", edit.record.id, vitalFromDraft(edit.draft, edit.record));
    setEdit(null);
  }

  const addLink = "/app/add?type=vital";

  return (
    <div>
      <PageHeader
        title="Measurements"
        subtitle={
          vitals.length === 0
            ? "Track your numbers over time — blood pressure, weight, blood sugar and more."
            : `${vitals.length} reading${vitals.length === 1 ? "" : "s"} across ${snapshot.length} measure${snapshot.length === 1 ? "" : "s"}`
        }
        action={
          <Link to={addLink} className={buttonStyles("primary", "md")}>
            <PlusIcon size={18} strokeWidth={2.25} />
            Add measurement
          </Link>
        }
      />

      {vitals.length === 0 ? (
        <EmptyState
          icon={<VitalsIcon size={28} />}
          title="No measurements yet"
          description="Log a reading and it'll build into a trend you can watch — and share with a clinician."
          action={
            <Link to={addLink} className={buttonStyles("primary", "md")}>
              <PlusIcon size={18} strokeWidth={2.25} />
              Add a measurement
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          <Section question="Where your numbers stand" lead="The latest reading for each thing you track.">
            <ul className="mt-4">
              {snapshot.map(({ key, latest, values }) => (
                <li key={key} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
                    <VitalsIcon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-mhl-body font-semibold text-mhl-ink">
                      {vitalName(latest)}
                    </p>
                    <p className="text-mhl-fine text-mhl-muted">
                      measured {formatRelative(latest.measuredAt)}
                    </p>
                  </div>
                  {values.length > 1 && (
                    <Sparkline values={values} className="hidden text-mhl-accent sm:block" />
                  )}
                  <div className="flex-none text-right">
                    <p className="whitespace-nowrap text-mhl-lead font-bold text-mhl-ink">
                      {formatVitalValue(latest)}
                    </p>
                    <div className="mt-0.5 flex justify-end">
                      <StatusTag reading={latest} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section question="Every reading">
            {presentTypes.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <FilterChip active={activeFilter === "ALL"} onClick={() => setFilter("ALL")}>
                  All
                </FilterChip>
                {presentTypes.map((t) => (
                  <FilterChip key={t} active={activeFilter === t} onClick={() => setFilter(t)}>
                    {VITAL_LABELS[t]}
                  </FilterChip>
                ))}
              </div>
            )}
            <ul className="mt-3 divide-y divide-mhl-rule">
              {history.map((v) => (
                <li key={v.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
                    <VitalsIcon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-mhl-body font-semibold text-mhl-ink">
                        {formatVitalValue(v)}
                      </p>
                      <p className="text-mhl-fine text-mhl-muted">{vitalName(v)}</p>
                    </div>
                    <p className="text-mhl-fine text-mhl-faint">
                      {formatDateTime(v.measuredAt)}
                      {v.context ? ` · ${v.context}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-none items-center">
                    <IconButton
                      label={`Edit ${vitalName(v)} reading`}
                      onClick={() => {
                        setEdit({ record: v, draft: vitalToDraft(v) });
                        setErrors({});
                      }}
                    >
                      <EditIcon size={18} />
                    </IconButton>
                    <IconButton
                      label={`Delete ${vitalName(v)} reading`}
                      tone="danger"
                      onClick={() => setDel(v)}
                    >
                      <TrashIcon size={18} />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <RecordEditModal<VitalReadingDraft>
        open={edit !== null}
        title="Edit measurement"
        draft={edit?.draft ?? null}
        errors={errors}
        Fields={VitalFields}
        onChange={(patch) => setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))}
        onSave={save}
        onClose={() => setEdit(null)}
      />

      <ConfirmDialog
        open={del !== null}
        title="Delete this reading?"
        message={
          del ? `Your ${vitalName(del)} reading from ${formatDateTime(del.measuredAt)} will be removed.` : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (del) removeItem("vitals", del.id);
        }}
        onClose={() => setDel(null)}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-mhl-fine font-medium transition-colors",
        active
          ? "bg-mhl-accent text-white"
          : "bg-mhl-sunk text-mhl-muted hover:text-mhl-ink",
      )}
    >
      {children}
    </button>
  );
}
