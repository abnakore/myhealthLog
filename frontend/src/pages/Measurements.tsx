import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import {
  VITAL_LABELS,
  VITAL_META,
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
import { ModeHint } from "@/components/modes/ModeHint";
import { Section } from "@/components/ui/Section";
import { buttonStyles } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { Sparkline } from "@/components/ui/Sparkline";
import { ConfirmDialog } from "@/components/ui/Modal";
import {
  ChevronRightIcon,
  ClockIcon,
  EditIcon,
  HeartIcon,
  PlusIcon,
  TrashIcon,
  VitalsIcon,
} from "@/components/icons";

// The clinical display order, shared by the snapshot and the filter chips.
const VITAL_ORDER = Object.keys(VITAL_LABELS) as VitalType[];

const STATUS_TAG: Record<VitalStatus, { tone: TagTone; label: string }> = {
  low: { tone: "watch", label: "Low" },
  normal: { tone: "ok", label: "In range" },
  high: { tone: "watch", label: "High" },
};

// Custom readings are grouped by their name so "Ketones" and "Mood" stay apart.
function groupKeyOf(v: VitalReading): string {
  return v.vitalType === "CUSTOM"
    ? `CUSTOM:${(v.label ?? "").trim().toLowerCase()}`
    : v.vitalType;
}

function StatusTag({ reading }: { reading: VitalReading }) {
  const status = vitalStatus(reading);
  if (!status) return null;
  const { tone, label } = STATUS_TAG[status];
  return <Tag tone={tone}>{label}</Tag>;
}

export default function Measurements() {
  const { canEdit } = useCareProxy();
  const { vitals, updateItem, removeItem } = useRecords();
  const [edit, setEdit] = useState<{ record: VitalReading; draft: VitalReadingDraft } | null>(
    null,
  );
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
      (a, b) =>
        VITAL_ORDER.indexOf(a.latest.vitalType) - VITAL_ORDER.indexOf(b.latest.vitalType),
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
    const sorted = [...vitals].sort(
      (a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt),
    );
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
    <div className="space-y-5">
      <PageHeader
        title="Measurements"
        subtitle={
          vitals.length === 0
            ? "Track your numbers over time — blood pressure, weight, blood sugar and more."
            : `${vitals.length} reading${vitals.length === 1 ? "" : "s"} across ${snapshot.length} measure${snapshot.length === 1 ? "" : "s"}`
        }
        action={
          canEdit ? (
            <Link to={addLink} className={buttonStyles("primary", "md")}>
              <PlusIcon size={18} strokeWidth={2.5} />
              Add measurement
            </Link>
          ) : undefined
        }
      />
      <ModeHint page="measurements" />

      {vitals.length === 0 ? (
        <EmptyState
          icon={<VitalsIcon size={22} />}
          title="No measurements yet"
          description="Log a reading and it'll build into a trend you can watch — and share with a clinician."
          action={
            canEdit ? (
              <Link to={addLink} className={buttonStyles("primary", "md")}>
                <PlusIcon size={18} strokeWidth={2.5} />
                Add a measurement
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <Section
            icon={<VitalsIcon size={18} />}
            question="Where your numbers stand"
            lead="The latest reading for each thing you track."
          >
            <ul className="mt-3">
              {snapshot.map(({ key, latest, values }) => {
                const unit = latest.unit || VITAL_META[latest.vitalType]?.unit || "";
                const full = formatVitalValue(latest);
                const figure =
                  unit && full.endsWith(` ${unit}`) ? full.slice(0, -(unit.length + 1)) : full;
                return (
                  <li key={key} className="border-t border-mhl-rule first:border-t-0">
                    <div className="flex min-w-0 items-center gap-3.5 py-3.5">
                      <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
                        {latest.vitalType === "BLOOD_PRESSURE" ? (
                          <HeartIcon size={21} />
                        ) : (
                          <VitalsIcon size={21} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.99rem] font-semibold text-mhl-ink">
                          {vitalName(latest)}
                        </p>
                        <p className="truncate text-[0.845rem] text-mhl-muted">
                          measured {formatRelative(latest.measuredAt)}
                        </p>
                      </div>
                      <div className="ml-auto flex flex-none items-center gap-3">
                        {values.length > 1 && (
                          <span className="hidden w-[4.25rem] flex-none sm:block">
                            <Sparkline
                              values={values}
                              width={72}
                              height={32}
                              strokeWidth={1.8}
                              className={
                                latest.vitalType === "WEIGHT"
                                  ? "block h-8 w-full text-mhl-info"
                                  : "block h-8 w-full text-mhl-good"
                              }
                            />
                          </span>
                        )}
                        <div className="flex w-[6.75rem] flex-none flex-col items-end gap-1 text-right">
                          <p className="flex items-baseline justify-end gap-[0.18rem] whitespace-nowrap text-[1.06rem] font-bold text-mhl-ink [font-variant-numeric:tabular-nums]">
                            <span>{figure}</span>
                            {unit && (
                              <span className="text-[0.7em] font-semibold text-mhl-muted">
                                {unit}
                              </span>
                            )}
                          </p>
                          <StatusTag reading={latest} />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section
            icon={<ClockIcon size={18} />}
            question="Every reading"
            lead="The full history, newest first."
          >
            {presentTypes.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
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
            <ul className="mt-2">
              {history.map((v) => {
                return (
                  <li key={v.id} className="group/row border-t border-mhl-rule first:border-t-0">
                    <div className="flex min-w-0 items-center gap-2 py-3.5">
                      <Link
                        to={`/app/records/measurements/${v.id}`}
                        className="group flex min-w-0 flex-1 items-center gap-3.5 rounded-mhl-sm"
                      >
                        <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted transition-colors group-hover:bg-mhl-accent-lo group-hover:text-mhl-accent">
                          <VitalsIcon size={21} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-[0.99rem] font-semibold text-mhl-ink [font-variant-numeric:tabular-nums]">
                              {formatVitalValue(v)}
                            </span>
                            <span className="text-[0.845rem] text-mhl-muted">
                              {vitalName(v)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[0.845rem] text-mhl-faint">
                            {formatDateTime(v.measuredAt)}
                            {v.context ? ` · ${v.context}` : ""}
                          </span>
                        </span>
                        <span className="flex-none text-mhl-faint transition-colors group-hover:text-mhl-accent">
                          <ChevronRightIcon size={17} />
                        </span>
                      </Link>
                      {canEdit && (
                        <div className="flex flex-none items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
                          <IconButton
                            label={`Edit ${vitalName(v)} reading`}
                            onClick={() => {
                              setEdit({ record: v, draft: vitalToDraft(v) });
                              setErrors({});
                            }}
                          >
                            <EditIcon size={17} />
                          </IconButton>
                          <IconButton
                            label={`Delete ${vitalName(v)} reading`}
                            tone="danger"
                            onClick={() => setDel(v)}
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
        </>
      )}

      <RecordEditModal<VitalReadingDraft>
        open={edit !== null}
        title="Edit measurement"
        draft={edit?.draft ?? null}
        errors={errors}
        Fields={VitalFields}
        onChange={(patch) =>
          setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))
        }
        onSave={save}
        onClose={() => setEdit(null)}
      />

      <ConfirmDialog
        open={del !== null}
        title="Delete this reading?"
        message={
          del
            ? `Your ${vitalName(del)} reading from ${formatDateTime(del.measuredAt)} will be removed.`
            : ""
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
        "rounded-full px-3 py-1.5 text-[0.8rem] font-semibold transition-colors",
        active
          ? "bg-mhl-accent text-white"
          : "bg-mhl-sunk text-mhl-muted hover:text-mhl-ink",
      )}
    >
      {children}
    </button>
  );
}
