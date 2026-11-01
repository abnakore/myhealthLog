/**
 * Turning a built profile into rows.
 *
 * The profile is a *reading* of the record (lib/healthContexts.ts); this file is the
 * one place that gives that reading a face — an icon, a title, the value that matters,
 * and the reason the record is here ("Linked", "Mentioned", "Recent"). The profile page
 * and the dashboard both render from these rows, so a change in wording lands in both
 * instead of drifting.
 *
 * Every row that isn't linked yet carries a `link` action, which is how a record the
 * profile merely *surfaced* becomes one the user has actually claimed. Nothing is ever
 * linked automatically: the app does not decide that a reading belongs to a diagnosis.
 */
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  ALLERGY_SEVERITY_LABELS,
  ALLERGY_TYPE_LABELS,
  APPOINTMENT_STATUS_LABELS,
  CONDITION_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  SEVERITY_LABELS,
  formatVitalValue,
  vitalName,
  vitalStatus,
  type HealthDocument,
  type VitalReading,
} from "@/types/health";
import { formatDate, formatFileSize, yearOf } from "@/lib/format";
import { Tag, allergyTone, appointmentTone, conditionTone } from "@/components/ui/Tag";
import {
  BASIS_LABELS,
  type ContextProfile,
  type RecordCategory,
  type RelevanceBasis,
} from "@/lib/healthContexts";
import {
  AllergyIcon,
  CalendarIcon,
  ConditionIcon,
  DocumentIcon,
  PillIcon,
  ScanIcon,
  StethoscopeIcon,
  VaccineIcon,
  VitalsIcon,
} from "@/components/icons";

type RowIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export interface ContextRow {
  key: string;
  icon: RowIcon;
  title: string;
  meta?: string;
  /** The number or fact that leads the row, when there is one. */
  value?: string;
  tag?: ReactNode;
  /** ISO date, shown faint and right-aligned, and used to order the timeline. */
  when?: string;
  basis: RelevanceBasis;
  /** Offered when the record isn't linked to this context yet. */
  link?: () => void;
}

interface BuildArgs {
  profile: ContextProfile;
  /** Link a record to this context's conditions. Omitted for a read-only viewer. */
  onLink?: (category: RecordCategory, id: string) => void;
}

const BASIS_TONE: Record<RelevanceBasis, "ok" | "info" | "watch" | "neutral"> = {
  LINKED: "ok",
  INHERENT: "neutral",
  MENTION: "watch",
  RECENT: "neutral",
};

/** The one-line reason a record is on this profile, as a tag. */
export function BasisTag({ basis, className }: { basis: RelevanceBasis; className?: string }) {
  return (
    <Tag tone={BASIS_TONE[basis]} className={className}>
      {BASIS_LABELS[basis]}
    </Tag>
  );
}

/** What each group of records is called, in the user's words. */
export const CATEGORY_COPY: Record<
  RecordCategory,
  { question: string; lead: string; empty: (label: string) => string }
> = {
  conditions: {
    question: "What's being treated?",
    lead: "The condition this profile is built around, and anything else it touches.",
    empty: (label) => `Nothing else recorded against ${label}.`,
  },
  medications: {
    question: "What's being taken for it?",
    lead: "Medicines linked to this condition, plus any whose notes name it.",
    empty: () => "No medicines are linked to this yet.",
  },
  allergies: {
    question: "Anything to avoid?",
    lead: "Allergies that relate to this condition — allergies stay allergies, never conditions.",
    empty: () => "No related allergies on file.",
  },
  vitals: {
    question: "What do the numbers look like?",
    lead: "Measurements linked to this condition.",
    empty: () => "No related measurements recorded.",
  },
  documents: {
    question: "What's on file for it?",
    lead: "Lab results, scans and letters linked to this condition.",
    empty: () => "No related documents recorded.",
  },
  appointments: {
    question: "What care has happened, and what's next?",
    lead: "Visits linked to this condition, past and upcoming.",
    empty: () => "No related visits recorded.",
  },
  procedures: {
    question: "Anything that's been done?",
    lead: "Procedures linked to this condition.",
    empty: () => "No related procedures recorded.",
  },
  immunizations: {
    question: "What protection is up to date?",
    lead: "Vaccinations linked to this condition.",
    empty: () => "No related vaccinations recorded.",
  },
};

const CATEGORY_ICON: Record<RecordCategory, RowIcon> = {
  conditions: ConditionIcon,
  medications: PillIcon,
  allergies: AllergyIcon,
  vitals: VitalsIcon,
  documents: DocumentIcon,
  appointments: CalendarIcon,
  procedures: StethoscopeIcon,
  immunizations: VaccineIcon,
};

export function categoryIcon(category: RecordCategory, doc?: HealthDocument): RowIcon {
  if (category === "documents" && doc?.docType === "SCAN") return ScanIcon;
  return CATEGORY_ICON[category];
}

function vitalTag(reading: VitalReading): ReactNode {
  const status = vitalStatus(reading);
  if (!status) return null;
  const label = status === "normal" ? "In range" : status === "low" ? "Low" : "High";
  return <Tag tone={status === "normal" ? "ok" : "watch"}>{label}</Tag>;
}

/** The link action for one row — absent for a read-only viewer. */
function linkAction(
  onLink: BuildArgs["onLink"],
  category: RecordCategory,
  id: string,
): (() => void) | undefined {
  return onLink ? () => onLink(category, id) : undefined;
}

/** Build the rows for every category, from one built profile. */
export function buildContextRows({ profile, onLink }: BuildArgs): Record<RecordCategory, ContextRow[]> {
  const joins = (...parts: Array<string | null | undefined | false>) =>
    parts.filter(Boolean).join("  ·  ");

  return {
    conditions: profile.conditions.map(({ record: c, basis }) => ({
      key: `conditions-${c.id}`,
      icon: ConditionIcon,
      title: c.name,
      meta: joins(
        CONDITION_STATUS_LABELS[c.status],
        c.severity ? SEVERITY_LABELS[c.severity] : null,
        c.onsetDate ? `Since ${yearOf(c.onsetDate)}` : null,
      ),
      tag: <Tag tone={conditionTone(c.status)}>{CONDITION_STATUS_LABELS[c.status]}</Tag>,
      when: c.onsetDate,
      basis,
      link: basis === "MENTION" ? linkAction(onLink, "conditions", c.id) : undefined,
    })),

    medications: profile.medications.map(({ record: m, basis, linkable }) => ({
      key: `medications-${m.id}`,
      icon: PillIcon,
      title: m.name,
      meta: joins(m.dosage, m.frequency, m.prescriber, m.reason ? `For ${m.reason}` : null),
      tag: <Tag tone={m.active ? "ok" : "neutral"}>{m.active ? "Current" : "Past"}</Tag>,
      when: m.startDate,
      basis,
      link: linkable ? linkAction(onLink, "medications", m.id) : undefined,
    })),

    allergies: profile.allergies.map(({ record: a, basis, linkable }) => ({
      key: `allergies-${a.id}`,
      icon: AllergyIcon,
      title: a.substance,
      meta: joins(ALLERGY_TYPE_LABELS[a.allergyType], (a.reactions ?? []).join(", ")),
      tag: <Tag tone={allergyTone(a.severity)}>{ALLERGY_SEVERITY_LABELS[a.severity]}</Tag>,
      when: a.firstReactionDate,
      basis,
      link: linkable ? linkAction(onLink, "allergies", a.id) : undefined,
    })),

    vitals: profile.vitals.map(({ record: v, basis, linkable }) => ({
      key: `vitals-${v.id}`,
      icon: VitalsIcon,
      title: vitalName(v),
      meta: v.context,
      value: formatVitalValue(v),
      tag: vitalTag(v),
      when: v.measuredAt,
      basis,
      link: linkable ? linkAction(onLink, "vitals", v.id) : undefined,
    })),

    documents: profile.documents.map(({ record: d, basis, linkable }) => ({
      key: `documents-${d.id}`,
      icon: categoryIcon("documents", d),
      title: d.title,
      meta: joins(DOCUMENT_TYPE_LABELS[d.docType], formatFileSize(d.fileSize)),
      when: d.documentDate ?? d.uploadedAt,
      basis,
      link: linkable ? linkAction(onLink, "documents", d.id) : undefined,
    })),

    appointments: profile.appointments.map(({ record: a, basis, linkable }) => ({
      key: `appointments-${a.id}`,
      icon: CalendarIcon,
      title: a.title,
      meta: joins(a.facility, a.clinician, a.reason ? `Reason: ${a.reason}` : null),
      tag: <Tag tone={appointmentTone(a.status)}>{APPOINTMENT_STATUS_LABELS[a.status]}</Tag>,
      when: a.scheduledFor,
      basis,
      link: linkable ? linkAction(onLink, "appointments", a.id) : undefined,
    })),

    procedures: profile.procedures.map(({ record: p, basis, linkable }) => ({
      key: `procedures-${p.id}`,
      icon: StethoscopeIcon,
      title: p.name,
      meta: joins(p.facility, p.outcome),
      when: p.performedOn,
      basis,
      link: linkable ? linkAction(onLink, "procedures", p.id) : undefined,
    })),

    immunizations: profile.immunizations.map(({ record: im, basis, linkable }) => ({
      key: `immunizations-${im.id}`,
      icon: VaccineIcon,
      title: im.vaccine,
      meta: joins(
        im.doseNumber != null ? `Dose ${im.doseNumber}` : null,
        im.nextDue ? `Next due ${formatDate(im.nextDue)}` : null,
      ),
      when: im.administeredOn,
      basis,
      link: linkable ? linkAction(onLink, "immunizations", im.id) : undefined,
    })),
  };
}

/** Every row, newest first — the context's own timeline. */
export function orderedRows(rows: Record<RecordCategory, ContextRow[]>): ContextRow[] {
  return Object.values(rows)
    .flat()
    .filter((r) => Boolean(r.when))
    .sort((a, b) => +new Date(b.when ?? 0) - +new Date(a.when ?? 0));
}

/** Priority order: what the profile is *built on* before what it merely notices. The
    dashboard's short list uses this so its first row is always the best reason. */
export function priorityRows(rows: Record<RecordCategory, ContextRow[]>): ContextRow[] {
  const rank: Record<RelevanceBasis, number> = { LINKED: 0, INHERENT: 1, MENTION: 2, RECENT: 3 };
  return Object.values(rows)
    .flat()
    .sort(
      (a, b) =>
        rank[a.basis] - rank[b.basis] ||
        +new Date(b.when ?? 0) - +new Date(a.when ?? 0),
    );
}

/** The rows for one category that aren't linked yet — what the profile is offering to
    claim on the user's behalf, and never claiming silently. */
export function unlinkedRows(rows: ContextRow[]): ContextRow[] {
  return rows.filter((r) => Boolean(r.link));
}

interface ContextRowListProps {
  rows: ContextRow[];
  /** Wording for the link action, e.g. `Link to Asthma`. */
  linkLabel?: string;
  className?: string;
}

/** The list itself: one row per record, with the reason it is here, and — when it isn't
    linked yet — the action that would link it. */
export function ContextRowList({ rows, linkLabel, className }: ContextRowListProps) {
  return (
    <ul className={cn("divide-y divide-mhl-rule", className)}>
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <li key={row.key} className="py-3.5 first:pt-1 last:pb-0">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="truncate text-mhl-body font-semibold text-mhl-ink">{row.title}</p>
                  {row.tag}
                  <BasisTag basis={row.basis} />
                </div>
                {row.meta && <p className="mt-0.5 text-mhl-fine text-mhl-muted">{row.meta}</p>}
                {row.when && (
                  <p className="mt-0.5 text-mhl-fine text-mhl-faint">{formatDate(row.when)}</p>
                )}
                {row.link && linkLabel && (
                  <button
                    type="button"
                    onClick={row.link}
                    className="mt-1.5 text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
                  >
                    {linkLabel}
                  </button>
                )}
              </div>
              {row.value && (
                <p className="flex-none whitespace-nowrap text-mhl-body font-bold tabular-nums text-mhl-ink">
                  {row.value}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
