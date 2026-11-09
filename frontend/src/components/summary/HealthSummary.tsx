/**
 * The health summary page, shared by two readers:
 *
 *  - the signed-in Medical summary (/app/summary), with links into each list
 *  - the public emergency link, where the same sections are rendered without
 *    the signed-in app around them and only the sections the owner enabled.
 *
 * Keeping one component means the emergency page can never drift from the page
 * a clinician sees inside the app.
 */
import { useState, type ReactNode } from "react";
import { Section } from "@/components/ui/Section";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tag, allergyTone, appointmentTone, conditionTone } from "@/components/ui/Tag";
import { CardOut, Disc, NumberStatus, StripCell, VitalIcon } from "@/components/dashboard/parts";
import {
  ALLERGY_SEVERITY_LABELS,
  APPOINTMENT_STATUS_LABELS,
  CONDITION_STATUS_LABELS,
  formatVitalValue,
  isCriticalAllergy,
  vitalName,
  vitalStatus,
  VITAL_LABELS,
  type Sex,
  type VitalReading,
} from "@/types/health";
import { cn } from "@/lib/cn";
import { formatDate, formatTime } from "@/lib/format";
import {
  conditionPriority,
  readingPriority,
  summaryInsights,
  type Insight,
  type InsightLabFinding,
} from "@/lib/summaryInsights";
import {
  AllergyIcon,
  CalendarIcon,
  ConditionIcon,
  DropIcon,
  PhoneIcon,
  PillIcon,
  UserIcon,
  UsersIcon,
  VitalsIcon,
} from "@/components/icons";

const SEX_LABELS: Record<Sex, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

/** The display shape both readers can supply. The signed-in store has richer
 *  records, but this is exactly what a clinician reads on the page. */
export interface SummaryAllergy {
  substance: string;
  severity: string;
  reactions?: string[];
}

export interface SummaryCondition {
  name: string;
  status: string;
  severity?: string | null;
  onsetDate?: string | null;
  resolvedDate?: string | null;
  notes?: string | null;
}

export interface SummaryMedication {
  name: string;
  dosage?: string;
  frequency?: string;
  form?: string | null;
  active?: boolean;
}

export interface SummaryVital {
  vitalType: string;
  label?: string;
  value: string | number;
  value2?: string | number | null;
  unit?: string;
  measuredAt?: string | null;
}

export interface SummaryAppointment {
  title: string;
  scheduledFor: string;
  facility?: string | null;
  status: string;
}

export interface SummaryContact {
  name: string;
  relationship?: string;
  phone: string;
  priority?: number;
}

export interface SummaryProfile {
  fullName: string;
  dateOfBirth?: string | null;
  sex?: string | null;
  bloodType?: string | null;
  genotype?: string | null;
  emergencyContacts: SummaryContact[];
}

/** One row in "Latest readings" — the latest value plus the recent values used
 *  to judge whether it is normal. `full` is present for signed-in records, where
 *  the range rules can run; the public payload deliberately carries only values. */
export interface SummaryReading {
  latest: SummaryVital;
  values: number[];
  full?: VitalReading;
}

export interface MedicalSummaryData {
  profile: SummaryProfile;
  allergies: SummaryAllergy[];
  conditions: SummaryCondition[];
  medications: SummaryMedication[];
  readings: SummaryReading[];
  appointments: SummaryAppointment[];
  /** Abnormal results the AI read from lab documents, newest first. */
  labFindings?: InsightLabFinding[];
  /** An ongoing pregnancy changes what is safe to prescribe. */
  pregnant?: boolean;
}

export type SummarySections = Partial<
  Record<"allergies" | "conditions" | "medications" | "readings" | "appointments" | "contacts", boolean>
>;

/** Age in whole years, or nothing when no date of birth is on file. */
function ageFrom(dob?: string | null): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(+born)) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}

/** One fact in a section: disc, name, a plain sub-line, and at most one cue. */
function Row({
  icon,
  title,
  meta,
  tag,
}: {
  icon: ReactNode;
  title: string;
  meta?: ReactNode;
  tag?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 border-t border-mhl-rule py-3 first:border-t-0">
      <Disc size={40}>{icon}</Disc>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.99rem] font-semibold text-mhl-ink">{title}</p>
        {meta && <p className="truncate text-[0.845rem] text-mhl-muted">{meta}</p>}
      </div>
      {tag && <span className="flex-none">{tag}</span>}
    </li>
  );
}

function None({ text }: { text: string }) {
  return <p className="mt-3 text-mhl-fine text-mhl-muted">{text}</p>;
}

function readingValue(reading: SummaryReading): string {
  if (reading.full) return formatVitalValue(reading.full);
  const { latest } = reading;
  const value =
    latest.value2 !== null && latest.value2 !== undefined
      ? `${latest.value}/${latest.value2}`
      : String(latest.value);
  return latest.unit ? `${value} ${latest.unit}` : value;
}

function readingName(reading: SummaryReading): string {
  if (reading.full) return vitalName(reading.full);
  return (
    reading.latest.label ||
    VITAL_LABELS[reading.latest.vitalType as keyof typeof VITAL_LABELS] ||
    reading.latest.vitalType.replace(/_/g, " ").toLowerCase()
  );
}

function toInsightReading(reading: SummaryReading) {
  const { latest } = reading;
  const num = (v: string | number | null | undefined) =>
    v === null || v === undefined || v === "" ? null : Number(v);
  return {
    vitalType: latest.vitalType,
    label: latest.label,
    value: Number(latest.value),
    value2: num(latest.value2),
    unit: latest.unit,
    measuredAt: latest.measuredAt,
  };
}

/** A reading's cue: the danger band first, then the measure's normal range,
 *  then "Stable" for measures without a range that have a trail of values. */
function ReadingTag({ reading }: { reading: SummaryReading }) {
  const band = readingBandFor(reading);
  if (band) {
    return <Tag tone={band === "critical" ? "severe" : "watch"}>{band === "critical" ? "Urgent" : "Abnormal"}</Tag>;
  }
  if (reading.full) return <NumberStatus reading={reading.full} values={reading.values} />;
  const status = vitalStatus({
    vitalType: reading.latest.vitalType as VitalReading["vitalType"],
    value: Number(reading.latest.value),
  });
  if (!status) return null;
  return <Tag tone={status === "normal" ? "ok" : "watch"}>{status === "normal" ? "Normal" : status === "low" ? "Low" : "High"}</Tag>;
}

function readingBandFor(reading: SummaryReading) {
  const p = readingPriority(toInsightReading(reading));
  return p === 0 ? "critical" : p === 1 ? "warning" : null;
}

const INSIGHT_STYLE: Record<Insight["level"], { box: string; dot: string; label: string }> = {
  critical: { box: "border-mhl-danger/35 bg-mhl-danger-lo", dot: "bg-mhl-danger", label: "Urgent" },
  warning: { box: "border-mhl-ds-border bg-mhl-ds-bg", dot: "bg-mhl-ds-text", label: "Check" },
  info: { box: "border-mhl-rule bg-mhl-sunk", dot: "bg-mhl-muted", label: "Note" },
};

/** The first thing a clinician reads: what is dangerous or abnormal right now. */
function AttentionPanel({ insights }: { insights: Insight[] }) {
  const urgent = insights.filter((i) => i.level !== "info");
  const notes = insights.filter((i) => i.level === "info");
  return (
    <section
      aria-label="Needs attention first"
      className="min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface p-5 shadow-mhl"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-mhl-card font-bold text-mhl-ink">Needs attention first</h2>
        <p className="text-mhl-fine text-mhl-muted">
          {urgent.length === 0
            ? "Nothing urgent or abnormal on file."
            : `${urgent.filter((i) => i.level === "critical").length} urgent · ${urgent.filter((i) => i.level === "warning").length} to check`}
        </p>
      </div>
      {insights.length > 0 && (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {[...urgent, ...notes].map((insight, i) => {
            const style = INSIGHT_STYLE[insight.level];
            return (
              <li key={`${insight.title}-${i}`} className={cn("flex gap-3 rounded-mhl-sm border px-3.5 py-3", style.box)}>
                <span aria-hidden className={cn("mt-1.5 h-2 w-2 flex-none rounded-full", style.dot)} />
                <div className="min-w-0">
                  <p className="text-[0.92rem] font-semibold text-mhl-ink">
                    <span className="sr-only">{style.label}: </span>
                    {insight.title}
                  </p>
                  <p className="text-[0.83rem] text-mhl-muted">{insight.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[0.72rem] text-mhl-faint">
        Flags come from fixed clinical screening rules applied to this record. They prompt a check — they are not a diagnosis.
      </p>
    </section>
  );
}

export function HealthSummary({
  data,
  title = "Medical summary",
  subtitle = "Your record as a clinician reads it first — the facts they ask for, on one page.",
  action,
  banner,
  showLinks = true,
  sections = {},
}: {
  data: MedicalSummaryData;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  banner?: ReactNode;
  /** Signed-in pages link into each list; the public link has nowhere to go. */
  showLinks?: boolean;
  /** Sections the public reader may see. Defaults to everything for the app. */
  sections?: SummarySections;
}) {
  const { profile } = data;
  // One clock reading per mount keeps render pure.
  const [renderedAt] = useState(() => Date.now());
  const visible = {
    allergies: sections.allergies !== false,
    conditions: sections.conditions !== false,
    medications: sections.medications !== false,
    readings: sections.readings !== false,
    appointments: sections.appointments !== false,
    contacts: sections.contacts !== false,
  };

  const age = ageFrom(profile.dateOfBirth);
  const contacts = [...profile.emergencyContacts].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
  );
  const activeMeds = data.medications.filter((m) => m.active !== false);
  const openConditions = data.conditions.filter((c) => c.status !== "RESOLVED");
  // What is active and severe leads; resolved history sits at the bottom.
  const orderedConditions = [...data.conditions].sort(
    (a, b) => conditionPriority(a) - conditionPriority(b),
  );
  // An abnormal reading leads the list instead of hiding behind a normal one.
  const orderedReadings = [...data.readings]
    .sort((a, b) => readingPriority(toInsightReading(a)) - readingPriority(toInsightReading(b)))
    .slice(0, 6);
  // "Coming up" lists future visits; a past one left open is flagged instead.
  const comingUp = data.appointments
    .filter((a) => +new Date(a.scheduledFor) >= renderedAt)
    .slice(0, 3);
  const insights = summaryInsights({
    allergies: visible.allergies ? data.allergies : [],
    conditions: visible.conditions ? data.conditions : [],
    medications: visible.medications ? activeMeds : [],
    readings: visible.readings ? data.readings.map(toInsightReading) : [],
    labFindings: data.labFindings ?? [],
    appointments: data.appointments,
    bloodType: profile.bloodType,
    contactCount: profile.emergencyContacts.length,
    pregnant: data.pregnant,
    publicView: !showLinks,
  });
  // What a clinician must know before prescribing leads the list.
  const orderedAllergies = [...data.allergies].sort(
    (a, b) =>
      Number(isCriticalAllergy(b.severity as never)) -
      Number(isCriticalAllergy(a.severity as never)),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={title} subtitle={subtitle} action={action} />

      {banner}

      {/* The four facts every consultation starts with. */}
      <section
        aria-label="About you"
        className="min-w-0 overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-rule shadow-mhl"
      >
        <div className="grid grid-cols-2 gap-px min-[560px]:grid-cols-4">
          <StripCell
            icon={<CalendarIcon size={20} />}
            label="Age"
            value={age ?? "—"}
            sub={profile.dateOfBirth ? `Born ${formatDate(profile.dateOfBirth)}` : "Date of birth not on file"}
          />
          <StripCell
            icon={<UserIcon size={20} />}
            label="Sex"
            value={profile.sex ? SEX_LABELS[profile.sex as Sex] ?? profile.sex : "—"}
            sub="On the profile"
          />
          <StripCell
            icon={<DropIcon size={20} />}
            label="Blood type"
            value={profile.bloodType ?? "—"}
            sub={`Genotype ${profile.genotype ?? "—"}`}
          />
          <StripCell
            icon={<UsersIcon size={20} />}
            label={contacts.length === 1 ? "Emergency contact" : "Emergency contacts"}
            value={visible.contacts ? contacts.length : "—"}
            sub={visible.contacts ? contacts[0]?.name ?? "No one yet" : "Not shared"}
          />
        </div>
      </section>

      <AttentionPanel insights={insights} />

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {visible.allergies && (
            <Section
              icon={<AllergyIcon size={18} />}
              question="Allergies and reactions"
              lead="What must be known before anything is prescribed."
              action={showLinks ? <CardOut to="/app/allergies">View all</CardOut> : undefined}
            >
              {orderedAllergies.length > 0 ? (
                <ul className="mt-3">
                  {orderedAllergies.map((a, i) => (
                    <Row
                      key={`${a.substance}-${i}`}
                      icon={<AllergyIcon size={18} />}
                      title={a.substance}
                      meta={a.reactions?.length ? a.reactions.join(", ") : "Reaction not recorded"}
                      tag={
                        <Tag tone={allergyTone(a.severity as never)}>
                          {ALLERGY_SEVERITY_LABELS[a.severity as keyof typeof ALLERGY_SEVERITY_LABELS] ?? a.severity}
                        </Tag>
                      }
                    />
                  ))}
                </ul>
              ) : (
                <None text="No allergies on file." />
              )}
            </Section>
          )}

          {visible.conditions && (
            <Section
              icon={<ConditionIcon size={18} />}
              question="Conditions"
              lead={`${openConditions.length} active · ${data.conditions.length} on file`}
              action={showLinks ? <CardOut to="/app/conditions">View all</CardOut> : undefined}
            >
              {orderedConditions.length > 0 ? (
                <ul className="mt-3">
                  {orderedConditions.map((c, i) => (
                    <Row
                      key={`${c.name}-${i}`}
                      icon={<ConditionIcon size={18} />}
                      title={c.name}
                      meta={
                        c.onsetDate
                          ? `Since ${formatDate(c.onsetDate)}${c.resolvedDate ? ` · resolved ${formatDate(c.resolvedDate)}` : ""}`
                          : (c.notes ?? "On the record")
                      }
                      tag={
                        <Tag tone={conditionTone(c.status as never)}>
                          {CONDITION_STATUS_LABELS[c.status as keyof typeof CONDITION_STATUS_LABELS] ?? c.status}
                        </Tag>
                      }
                    />
                  ))}
                </ul>
              ) : (
                <None text="No conditions on file." />
              )}
            </Section>
          )}

          {visible.medications && (
            <Section
              icon={<PillIcon size={18} />}
              question="Current medications"
              lead={
                activeMeds.length === 1
                  ? "1 active medicine"
                  : `${activeMeds.length} active medicines`
              }
              action={showLinks ? <CardOut to="/app/medications">View all</CardOut> : undefined}
            >
              {activeMeds.length > 0 ? (
                <ul className="mt-3">
                  {activeMeds.map((m, i) => (
                    <Row
                      key={`${m.name}-${i}`}
                      icon={<PillIcon size={18} />}
                      title={m.name}
                      meta={[m.dosage, m.frequency].filter(Boolean).join(" · ") || "Dose not recorded"}
                      tag={m.form ? <Tag>{m.form}</Tag> : undefined}
                    />
                  ))}
                </ul>
              ) : (
                <None text="No active medicines on file." />
              )}
            </Section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {visible.readings && (
            <Section
              icon={<VitalsIcon size={18} />}
              question="Latest readings"
              lead="The last number recorded for each measure."
              action={showLinks ? <CardOut to="/app/measurements">View all</CardOut> : undefined}
            >
              {orderedReadings.length > 0 ? (
                <ul className="mt-3">
                  {orderedReadings.map((reading, i) => (
                    <li
                      key={`${reading.latest.vitalType}-${reading.latest.label ?? ""}-${i}`}
                      className="flex min-w-0 items-center gap-3 border-t border-mhl-rule py-3 first:border-t-0"
                    >
                      <Disc size={40}>
                        {reading.full ? (
                          <VitalIcon reading={reading.full} size={18} />
                        ) : (
                          <VitalsIcon size={18} />
                        )}
                      </Disc>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.99rem] font-semibold text-mhl-ink">
                          {readingName(reading)}
                        </p>
                        <p className="truncate text-[0.845rem] text-mhl-muted">
                          {reading.latest.measuredAt ? formatDate(reading.latest.measuredAt) : "Date not recorded"}
                        </p>
                      </div>
                      <p className="flex-none whitespace-nowrap text-[1.02rem] font-bold tracking-[-0.01em] text-mhl-ink [font-variant-numeric:tabular-nums]">
                        {readingValue(reading)}
                      </p>
                      <span className="hidden flex-none sm:block">
                        <ReadingTag reading={reading} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <None text="No readings on file yet." />
              )}
            </Section>
          )}

          {visible.appointments && (
            <Section
              icon={<CalendarIcon size={18} />}
              question="Coming up"
              lead="Booked visits, nearest first."
              action={showLinks ? <CardOut to="/app/appointments">View all</CardOut> : undefined}
            >
              {comingUp.length > 0 ? (
                <ul className="mt-3">
                  {comingUp.map((v, i) => (
                    <Row
                      key={`${v.title}-${i}`}
                      icon={<CalendarIcon size={18} />}
                      title={v.title}
                      meta={`${formatDate(v.scheduledFor)} · ${formatTime(v.scheduledFor)}${v.facility ? ` · ${v.facility}` : ""}`}
                      tag={
                        <Tag tone={appointmentTone(v.status as never)}>
                          {APPOINTMENT_STATUS_LABELS[v.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? v.status}
                        </Tag>
                      }
                    />
                  ))}
                </ul>
              ) : (
                <None text="No visits booked yet." />
              )}
            </Section>
          )}

          {visible.contacts && (
            <Section
              icon={<PhoneIcon size={18} />}
              question="In an emergency"
              lead="Who to call first, in the order you set."
              action={showLinks ? <CardOut to="/app/emergency">Emergency card</CardOut> : undefined}
            >
              {contacts.length > 0 ? (
                <ul className="mt-3">
                  {contacts.map((c, i) => (
                    <Row
                      key={`${c.name}-${i}`}
                      icon={<PhoneIcon size={18} />}
                      title={c.name}
                      meta={[c.relationship, c.phone].filter(Boolean).join(" · ")}
                      tag={
                        <a
                          href={`tel:${c.phone}`}
                          className={cn(
                            "inline-flex items-center rounded-full bg-mhl-accent-lo px-3 py-1.5 text-[0.805rem] font-semibold text-mhl-accent hover:bg-mhl-accent/15",
                          )}
                        >
                          Call
                        </a>
                      }
                    />
                  ))}
                </ul>
              ) : (
                <None text="No emergency contacts on file." />
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
