import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useAppMode } from "@/store/AppModeContext";
import { useContexts } from "@/store/ContextsContext";
import { buildContextProfile } from "@/lib/healthContexts";
import {
  ContextRowList,
  buildContextRows,
  priorityRows,
} from "@/components/context/ContextRows";
import {
  isCriticalAllergy,
  formatVitalValue,
  vitalName,
  vitalStatus,
  type VitalReading,
} from "@/types/health";
import { formatRelative, formatShortDate, yearOf } from "@/lib/format";
import { Section } from "@/components/ui/Section";
import { Tag, allergyTone, appointmentTone, type TagTone } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonStyles } from "@/components/ui/Button";
import { Sparkline } from "@/components/ui/Sparkline";
import { EmergencyCard } from "@/components/emergency/EmergencyCard";
import {
  AllergyIcon,
  CalendarIcon,
  ChevronRightIcon,
  DocumentIcon,
  PlusIcon,
  ScanIcon,
  VitalsIcon,
} from "@/components/icons";
import { APPOINTMENT_STATUS_LABELS } from "@/types/health";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Stat({ value, label, sub }: { value: ReactNode; label: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-mhl-title font-bold text-mhl-ink">{value}</p>
      <p className="text-mhl-fine text-mhl-muted">{label}</p>
      {sub && <p className="mt-0.5 text-[0.75rem] text-mhl-faint">{sub}</p>}
    </div>
  );
}

/** The gentle in/out-of-range cue on a reading — always beside the number, never alone. */
function NumberStatus({ reading }: { reading: VitalReading }) {
  const status = vitalStatus(reading);
  if (!status) return null;
  const tone: TagTone = status === "normal" ? "ok" : "watch";
  const label = status === "normal" ? "In range" : status === "low" ? "Low" : "High";
  return <Tag tone={tone}>{label}</Tag>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { mode, meta: modeMeta } = useAppMode();
  const { canEdit, isProxyView, activeOwnerName } = useCareProxy();
  const ModeIcon = modeMeta.Icon;
  const records = useRecords();
  const { profile, allergies, medications, appointments, documents, vitals } = records;
  const { active, activeLabel, deactivate } = useContexts();

  // The prioritised reading of the record, only when a context is open. Building it is
  // read-only — it doesn't touch the record, and the rest of the dashboard below shows
  // everything as usual either way.
  const contextProfile = useMemo(
    () =>
      active && active.id
        ? buildContextProfile({ bundle: records, ctx: active })
        : null,
    [active, records],
  );
  const contextRows = useMemo(
    () => (contextProfile ? buildContextRows({ profile: contextProfile }) : null),
    [contextProfile],
  );
  const contextHighlights = useMemo(
    () => (contextRows ? priorityRows(contextRows).slice(0, 4) : []),
    [contextRows],
  );

  const firstName = (user?.name ?? profile.fullName).split(" ")[0];
  const critical = allergies.filter((a) => isCriticalAllergy(a.severity));
  const activeMeds = medications.filter((m) => m.active);

  // The latest reading per measure, most-recently-measured first, capped at three —
  // enough to show momentum without turning the dashboard into the full tracker.
  const recentVitals = useMemo(() => {
    const groups = new Map<string, VitalReading[]>();
    for (const v of vitals) {
      const key =
        v.vitalType === "CUSTOM" ? `CUSTOM:${(v.label ?? "").trim().toLowerCase()}` : v.vitalType;
      const arr = groups.get(key);
      if (arr) arr.push(v);
      else groups.set(key, [v]);
    }
    const rows = Array.from(groups.values()).map((readings) => {
      const chrono = [...readings].sort(
        (a, b) => +new Date(a.measuredAt) - +new Date(b.measuredAt),
      );
      return { latest: chrono[chrono.length - 1], values: chrono.slice(-16).map((r) => r.value) };
    });
    rows.sort((a, b) => +new Date(b.latest.measuredAt) - +new Date(a.latest.measuredAt));
    return rows.slice(0, 3);
  }, [vitals]);

  const lastVisit = useMemo(
    () =>
      [...appointments]
        .filter((a) => a.status === "ATTENDED")
        .sort((a, b) => +new Date(b.scheduledFor) - +new Date(a.scheduledFor))[0],
    [appointments],
  );

  const nextVisit = useMemo(() => {
    const now = Date.now();
    return [...appointments]
      .filter((a) => a.status === "SCHEDULED" && +new Date(a.scheduledFor) >= now)
      .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor))[0];
  }, [appointments]);

  const activity = useMemo(() => {
    const items = [
      ...documents.map((d) => ({
        id: d.id,
        icon: d.docType === "SCAN" ? ScanIcon : DocumentIcon,
        label: d.title,
        meta: "Document added",
        when: d.uploadedAt,
      })),
      ...appointments
        .filter((a) => a.status === "ATTENDED")
        .map((a) => ({
          id: a.id,
          icon: CalendarIcon,
          label: a.title,
          meta: "Visit attended",
          when: a.scheduledFor,
        })),
    ];
    return items.sort((a, b) => +new Date(b.when) - +new Date(a.when)).slice(0, 5);
  }, [documents, appointments]);

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-mhl-answer font-bold text-mhl-ink">
            {timeGreeting()}, {firstName}
          </h1>
          {contextProfile ? (
            <Link
              to={`/app/contexts/${contextProfile.ctx.id}`}
              className="mt-1 inline-flex flex-none items-center gap-1.5 rounded-full bg-mhl-accent px-3 py-1.5 text-mhl-fine font-semibold text-white transition-colors hover:brightness-95"
            >
              <ModeIcon size={15} />
              {activeLabel} profile
            </Link>
          ) : (
            mode !== "standard" && (
              <Link
                to="/app/profile"
                className="mt-1 inline-flex flex-none items-center gap-1.5 rounded-full bg-mhl-accent-lo px-3 py-1.5 text-mhl-fine font-semibold text-mhl-accent transition-colors hover:bg-mhl-accent/15"
              >
                <ModeIcon size={15} />
                {modeMeta.label} mode
              </Link>
            )
          )}
        </div>
        <p className="mt-1 text-mhl-body text-mhl-muted">
          {isProxyView
            ? `Here's where ${activeOwnerName}'s record stands today.`
            : "Here's where your health record stands today."}
        </p>
      </header>

      {/* The context's leading records — a prioritised reading, not a filtered one. The
          complete dashboard carries on below, exactly as it does with no profile open. */}
      {contextProfile && contextHighlights.length > 0 && (
        <Section
          question={`Because ${activeLabel} is in focus`}
          lead="Everything linked to this profile, brought forward. Your complete record continues below."
          action={
            <Link
              to={`/app/contexts/${contextProfile.ctx.id}`}
              className="text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
            >
              Open profile
            </Link>
          }
        >
          <ContextRowList rows={contextHighlights} className="mt-2" />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mhl-rule pt-3">
            <Link to="/app/contexts" className="text-mhl-fine font-semibold text-mhl-muted hover:text-mhl-ink">
              Switch profile
            </Link>
            <button
              type="button"
              onClick={deactivate}
              className="text-mhl-fine font-semibold text-mhl-muted hover:text-mhl-ink"
            >
              Back to all health records
            </button>
          </div>
        </Section>
      )}

      {/* Most urgent thing first, when there is one. */}
      {critical.length > 0 && (
        <div className="rounded-mhl border border-mhl-danger/25 bg-mhl-danger-lo p-4">
          <div className="flex items-center gap-2 text-mhl-danger">
            <AllergyIcon size={20} />
            <h2 className="text-mhl-lead font-bold text-mhl-danger">
              {critical.length === 1 ? "A life-threatening allergy is on file" : "Life-threatening allergies on file"}
            </h2>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {critical.map((a) => (
              <Tag key={a.id} tone={allergyTone(a.severity)}>
                {a.substance}
              </Tag>
            ))}
          </div>
          <p className="mt-2.5 text-mhl-fine text-mhl-ink">
            {isProxyView ? "These show on their emergency card." : "These show on your emergency card."}{" "}
            <Link to="/app/allergies" className="font-semibold text-mhl-danger hover:underline">
              Review allergies
            </Link>
          </p>
        </div>
      )}

      <Section question="Your health at a glance">
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Stat
            value={profile.bloodType ?? "—"}
            label="Blood type"
            sub={`Genotype ${profile.genotype ?? "—"}`}
          />
          <Stat
            value={allergies.length}
            label={allergies.length === 1 ? "Allergy" : "Allergies"}
            sub={
              critical.length > 0 ? (
                <span className="font-semibold text-mhl-danger">{critical.length} need care</span>
              ) : (
                "None critical"
              )
            }
          />
          <Stat
            value={activeMeds.length}
            label="Active meds"
            sub={`${medications.length} in total`}
          />
          <Stat
            value={lastVisit ? formatShortDate(lastVisit.scheduledFor) : "—"}
            label="Last visit"
            sub={lastVisit ? yearOf(lastVisit.scheduledFor) : "No visits yet"}
          />
        </div>
      </Section>

      {recentVitals.length > 0 && (
        <Section
          question="How have your numbers been?"
          action={
            <Link
              to="/app/measurements"
              className="text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
            >
              See all
            </Link>
          }
        >
          <ul className="mt-2 divide-y divide-mhl-rule">
            {recentVitals.map(({ latest, values }) => (
              <li key={latest.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
                  <VitalsIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-mhl-body font-medium text-mhl-ink">
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
                  <p className="whitespace-nowrap text-mhl-body font-bold text-mhl-ink">
                    {formatVitalValue(latest)}
                  </p>
                  <div className="mt-0.5 flex justify-end">
                    <NumberStatus reading={latest} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* The card of the record on screen — the owner's own settings, so a proxy sees
          their relative's real card here, minus the link to manage it. */}
      <EmergencyCard hideManageLink={isProxyView} />

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Link to="/app/add" className={buttonStyles("primary", "md")}>
            <PlusIcon size={18} strokeWidth={2.25} />
            Add a record
          </Link>
        )}
        <Link to="/app/timeline" className={buttonStyles("secondary", "md")}>
          View timeline
        </Link>
        <Link to="/app/profile" className={buttonStyles("secondary", "md")}>
          Medical profile
        </Link>
      </div>

      {nextVisit && (
        <Section
          question="What's coming up?"
          action={
            <Link
              to="/app/appointments"
              className="text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
            >
              All visits
            </Link>
          }
        >
          <div className="mt-3 flex items-start gap-3 rounded-mhl-sm bg-mhl-sunk p-3.5">
            <span className="mt-0.5 flex-none text-mhl-accent">
              <CalendarIcon size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-mhl-body font-semibold text-mhl-ink">{nextVisit.title}</p>
                <Tag tone={appointmentTone(nextVisit.status)}>
                  {APPOINTMENT_STATUS_LABELS[nextVisit.status]}
                </Tag>
              </div>
              <p className="mt-0.5 text-mhl-fine text-mhl-muted">
                {formatShortDate(nextVisit.scheduledFor)}
                {nextVisit.facility ? ` · ${nextVisit.facility}` : ""}
              </p>
            </div>
          </div>
        </Section>
      )}

      <Section question="What's happened recently?">
        {activity.length > 0 ? (
          <ul className="mt-2 divide-y divide-mhl-rule">
            {activity.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-mhl-body font-medium text-mhl-ink">{item.label}</p>
                    <p className="text-mhl-fine text-mhl-muted">{item.meta}</p>
                  </div>
                  <span className="flex-none text-mhl-fine text-mhl-faint">{formatRelative(item.when)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            className="mt-3"
            icon={<DocumentIcon size={26} />}
            title="Nothing here yet"
            description="Records you add will show up here as recent activity."
            action={
              canEdit ? (
                <Link to="/app/add" className={buttonStyles("primary", "md")}>
                  <PlusIcon size={18} strokeWidth={2.25} />
                  Add a record
                </Link>
              ) : undefined
            }
          />
        )}
      </Section>

      <p className="flex items-center justify-center gap-1 pt-1 text-mhl-fine text-mhl-faint">
        {isProxyView ? `${activeOwnerName}'s record, kept private` : "Your records are private to you"}
        <ChevronRightIcon size={14} />
      </p>
    </div>
  );
}
