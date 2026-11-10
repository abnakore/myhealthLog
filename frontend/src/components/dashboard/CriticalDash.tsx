/**
 * Critical mode dashboard — the condition-focused home screen.
 *
 * Fully dynamic: the banner, the metric row, the readings, the care plan and
 * the follow-up all derive from whichever condition is in focus (see
 * lib/conditionGuide.ts). Asthma shows peak flow and a reliever inhaler;
 * diabetes shows blood sugar; an unknown condition still gets its own linked
 * medications, readings and a plain-language plan. Nothing is hard-coded to
 * one illness.
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import type { Appointment, Condition, Medication } from "@/types/health";
import { CONDITION_STATUS_LABELS, SEVERITY_LABELS } from "@/types/health";
import { formatDate } from "@/lib/format";
import {
  guideFor,
  conditionReadings,
  conditionMedications,
  conditionFollowUp,
  conditionStatus,
  headlineReading,
  type VitalGroup,
} from "@/lib/conditionGuide";
import { Sparkline } from "@/components/ui/Sparkline";
import { Tag } from "@/components/ui/Tag";
import { EmergencyCard } from "@/components/emergency/EmergencyCard";
import {
  ActivityCard,
  CardHead,
  CardOut,
  Disc,
  ProxyAccessCard,
  ReadingRow,
  UpcomingCard,
  type ActivityItem,
} from "./parts";
import {
  CalendarIcon,
  ChevronRightIcon,
  ConditionIcon,
  DropIcon,
  HeartIcon,
  HeartPulseIcon,
  PillIcon,
  ShieldIcon,
  StethoscopeIcon,
  VitalsIcon,
} from "@/components/icons";
import { LeafBranchArt } from "@/components/ui/Motifs";
import { MODE_ART } from "@/lib/modeArt";

/** The family's icon — a lung-ish mark for respiratory, a drop for metabolic… */
export function FamilyIcon({ family, size = 22 }: { family: string; size?: number }) {
  if (family === "respiratory") return <StethoscopeIcon size={size} />;
  if (family === "metabolic") return <DropIcon size={size} />;
  if (family === "cardiac") return <HeartPulseIcon size={size} />;
  if (family === "maternal") return <HeartIcon size={size} />;
  if (family === "musculoskeletal") return <VitalsIcon size={size} />;
  if (family === "hematological") return <DropIcon size={size} />;
  return <ConditionIcon size={size} />;
}

/** "Mild persistent asthma · Diagnosed 2021" — the condition's own facts. */
function conditionLine(c: Condition): string {
  const bits: string[] = [];
  if (c.severity) bits.push(`${SEVERITY_LABELS[c.severity]} ${c.name.toLowerCase()}`);
  if (c.onsetDate) bits.push(`Diagnosed ${new Date(c.onsetDate).getFullYear()}`);
  if (bits.length === 0 && c.notes) bits.push(c.notes.split(".")[0].trim());
  return bits.join(" · ");
}

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  sub: ReactNode;
  spark?: number[];
  to?: string;
}

/** One tile in the four-up metric row. */
function MetricCard({ icon, label, value, sub, spark, to }: MetricCardProps) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <Disc size={36}>{icon}</Disc>
        <p className="min-w-0 flex-1 truncate text-[0.85rem] font-semibold text-mhl-muted">{label}</p>
        {to && (
          <span className="flex-none text-mhl-faint transition-transform group-hover:translate-x-0.5 group-hover:text-mhl-accent">
            <ChevronRightIcon size={16} />
          </span>
        )}
      </div>
      <p className="mt-3 truncate text-[1.35rem] font-bold leading-none tracking-[-0.025em] text-mhl-ink [font-variant-numeric:tabular-nums]">
        {value}
      </p>
      <div className="mt-2 flex min-w-0 items-end justify-between gap-2">
        <p className="min-w-0 truncate text-[0.8rem] leading-snug text-mhl-muted">{sub}</p>
        {spark && spark.length > 1 && (
          <span className="flex-none">
            <Sparkline values={spark} width={72} height={26} className="text-mhl-good" />
          </span>
        )}
      </div>
    </>
  );
  const cls = "mhl-cardlink group flex h-full min-w-0 flex-col rounded-mhl border border-mhl-rule bg-mhl-surface px-4 pb-4 pt-4 shadow-mhl";
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export interface CriticalDashProps {
  condition: Condition;
  meds: Medication[];
  groups: VitalGroup[];
  appointments: Appointment[];
  activity: ActivityItem[];
  trustedContacts: string[];
  canEdit: boolean;
  onChangeFocus: () => void;
  /** Whatever else is in focus (another condition, elderly care). */
  alsoInFocus?: ReactNode;
}

/**
 * One condition in focus: its banner (in the record's own words) and the four
 * facts about right now. Critical mode leads with it; when several things are
 * in focus, every other condition gets one too, so none is reduced to a chip.
 */
export function ConditionPanel({
  condition,
  meds,
  groups,
  appointments,
  onChangeFocus,
  alsoInFocus = false,
}: {
  condition: Condition;
  meds: Medication[];
  groups: VitalGroup[];
  appointments: Appointment[];
  onChangeFocus: () => void;
  /** Shown beside a leading pregnancy or another condition. */
  alsoInFocus?: boolean;
}) {
  const guide = guideFor(condition);
  const linkedMeds = conditionMedications(condition, meds);
  const followUp = conditionFollowUp(condition, appointments);
  const status = conditionStatus(condition, guide, groups);
  const headline = headlineReading(condition, guide, groups);

  // The rescue medicine, when the family names one and it's on file.
  const rescue = guide.rescueLabel
    ? linkedMeds.find((m) =>
        /inhaler|reliever|rescue|salbutamol|albuterol|ventolin/i.test(`${m.name} ${m.form ?? ""}`),
      )
    : undefined;

  const headlineValue = headline
    ? `${headline.latest.value}${headline.latest.value2 != null ? `/${headline.latest.value2}` : ""} ${headline.latest.unit}`
    : "No readings";

  return (
    <>
      {/* The condition banner — who's in focus, in the record's own words. */}
      <section
        aria-label={`${condition.name} in focus`}
        className="mhl-mode-hero relative min-w-0 overflow-hidden rounded-mhl border border-mhl-rule bg-gradient-to-br from-mhl-accent-lo/80 via-mhl-surface to-mhl-surface p-5 sm:p-6"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-mhl-accent/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-2 top-3 hidden text-mhl-accent/25 sm:block"
        >
          <LeafBranchArt className="block h-28 w-36" />
        </div>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          {guide.family === "respiratory" ? (
            // The lungs from the critical-condition preview.
            <img
              src={MODE_ART.critical.lungs}
              alt=""
              className="h-16 w-16 flex-none rounded-full mix-blend-multiply"
            />
          ) : (
            <span className="grid h-16 w-16 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent ring-1 ring-mhl-accent/25">
              <FamilyIcon family={guide.family} size={30} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {alsoInFocus && (
              <p className="mb-1 text-[0.76rem] font-bold uppercase tracking-[0.12em] text-mhl-accent">
                Also in focus
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-mhl-answer font-bold tracking-[-0.025em] text-mhl-ink">
                {condition.name}
              </h2>
              <Tag tone={condition.status === "ACTIVE" ? "watch" : "neutral"}>
                {CONDITION_STATUS_LABELS[condition.status]}
              </Tag>
            </div>
            {conditionLine(condition) && (
              <p className="mt-1 text-mhl-fine font-medium text-mhl-muted">{conditionLine(condition)}</p>
            )}
            <p className="mt-2 max-w-[52ch] text-mhl-body text-mhl-muted [text-wrap:pretty]">
              {condition.notes?.split(".")[0]?.trim()
                ? `${condition.notes.split(".")[0].trim()}.`
                : status.label === "Stable"
                  ? "Your condition is currently steady on the record."
                  : "Some recent readings sit outside the usual band, worth a look."}{" "}
              Keep up with your medications and avoid known triggers.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              <Link
                to={`/app/conditions`}
                className="mhl-interactive inline-flex min-h-11 items-center gap-2 rounded-full bg-mhl-surface px-5 py-2.5 text-mhl-body font-bold text-mhl-ink shadow-mhl hover:bg-mhl-sunk"
              >
                View full condition details
                <ChevronRightIcon size={16} />
              </Link>
              <button
                type="button"
                onClick={onChangeFocus}
                className="mhl-interactive inline-flex min-h-11 items-center rounded-full border border-mhl-rule bg-mhl-surface px-5 py-2.5 text-mhl-body font-semibold text-mhl-muted hover:border-mhl-accent/50 hover:text-mhl-ink"
              >
                {alsoInFocus ? "Change focus" : "Change focused condition"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Four facts about right now — status, the family's number, the rescue
          medicine, and the next visit. */}
      <section aria-label="Condition at a glance" className="grid min-w-0 grid-cols-2 gap-3.5 min-[560px]:grid-cols-4">
        <MetricCard
          icon={<ShieldIcon size={18} />}
          label="Current status"
          value={status.label}
          sub={status.detail}
          spark={headline?.values}
        />
        <MetricCard
          icon={<VitalsIcon size={18} />}
          label={headline ? headline.latest.vitalType === "PEAK_FLOW" ? "Peak flow (best)" : "Latest reading" : "Key reading"}
          value={headlineValue}
          sub={headline ? `Last ${formatDate(headline.latest.measuredAt)}` : "No readings yet"}
          spark={headline?.values}
          to="/app/measurements"
        />
        {rescue ? (
          <MetricCard
            icon={<PillIcon size={18} />}
            label={guide.rescueLabel ?? "Rescue medicine"}
            value={`${linkedMeds.filter((m) => m.form === "Inhaler").length || 1} on file`}
            sub={`${rescue.name}${rescue.dosage ? ` ${rescue.dosage}` : ""}`}
            to="/app/medications"
          />
        ) : (
          <MetricCard
            icon={<PillIcon size={18} />}
            label="Active medicines"
            value={`${linkedMeds.length}`}
            sub={linkedMeds.slice(0, 2).map((m) => m.name).join(", ") || "None on file"}
            to="/app/medications"
          />
        )}
        <MetricCard
          icon={<CalendarIcon size={18} />}
          label="Next follow-up"
          value={followUp ? formatDate(followUp.scheduledFor) : "None booked"}
          sub={followUp?.facility ?? (followUp ? followUp.title : "Not booked yet")}
          to="/app/appointments"
        />
      </section>

    </>
  );
}

export function CriticalDash({
  condition,
  meds,
  groups,
  appointments,
  activity,
  trustedContacts,
  onChangeFocus,
  alsoInFocus,
}: CriticalDashProps) {
  const guide = guideFor(condition);
  const readings = conditionReadings(condition, guide, groups);

  return (
    <>
      <ConditionPanel
        condition={condition}
        meds={meds}
        groups={groups}
        appointments={appointments}
        onChangeFocus={onChangeFocus}
      />

      {alsoInFocus}

      <div className="mhl-dash__cols">
        <div className="mhl-dash__left flex min-w-0 flex-col gap-5">
          {/* The readings this condition's team watches — linked first. */}
          <section
            aria-labelledby="critical-meas-title"
            className="min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-1 pt-5 shadow-mhl"
          >
            <CardHead
              icon={<VitalsIcon size={16} />}
              title="Recent measurements"
              titleId="critical-meas-title"
              action={<CardOut to="/app/measurements">View all</CardOut>}
            />
            {readings.length > 0 ? (
              <div className="mt-2">
                {readings.map(({ latest, values }) => (
                  <ReadingRow key={latest.id} latest={latest} values={values} />
                ))}
              </div>
            ) : (
              <p className="mt-3 mb-4 text-mhl-fine text-mhl-muted">
                No measurements yet. Add a reading and this card becomes the shape of your numbers.
              </p>
            )}
          </section>

          <ActivityCard items={activity} />

          {/* The care plan — the family's steady habits, always four. */}
          <section
            aria-labelledby="careplan-title"
            className="relative min-w-0 overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl"
          >
            {guide.family === "respiratory" ? (
              // The care-plan lungs from the critical-condition preview.
              <img
                src={MODE_ART.critical.plan}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute bottom-3 right-3 hidden h-[5.6rem] w-[5.6rem] mix-blend-multiply sm:block"
              />
            ) : (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-mhl-accent-lo/70"
              />
            )}
            <div className="relative">
              <CardHead
                icon={<HeartIcon size={16} />}
                title={`${condition.name} care plan`}
                titleId="careplan-title"
                action={<CardOut to="/app/conditions">View details</CardOut>}
              />
              <p className="mt-2 text-mhl-fine text-mhl-muted">Your care plan includes</p>
              <ul className={cn("mt-2.5 space-y-2", guide.family === "respiratory" && "sm:pr-28")}>
                {guide.carePlan.map((step) => (
                  <li
                    key={step}
                    className="flex items-center gap-2.5 rounded-mhl-sm bg-mhl-sunk px-3.5 py-2.5 text-mhl-body text-mhl-ink"
                  >
                    <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-mhl-accent text-white">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        aria-hidden="true"
                      >
                        <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* The right column: the card of record, who can help, the next visits. */}
        <div className="mhl-dash__right flex min-w-0 flex-col gap-3.5">
          <EmergencyCard />
          <ProxyAccessCard
            contacts={trustedContacts}
            description="Give trusted family or friends limited access to your health information."
          />
          <UpcomingCard
            visits={appointments.filter((a) => a.status === "SCHEDULED")}
            title="Upcoming appointments"
            rescheduleHint
          />
        </div>
      </div>
    </>
  );
}
