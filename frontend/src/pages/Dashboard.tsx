import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useAppMode } from "@/store/AppModeContext";
import { useContexts } from "@/store/ContextsContext";
import { buildContextProfile, pregnancyView } from "@/lib/healthContexts";
import {
  ContextRowList,
  buildContextRows,
  priorityRows,
} from "@/components/context/ContextRows";
import {
  APPOINTMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  VITAL_META,
  formatVitalValue,
  isCriticalAllergy,
  vitalName,
  vitalStatus,
  type Appointment,
  type HealthDocument,
  type VitalReading,
} from "@/types/health";
import { formatDate, formatTime } from "@/lib/format";
import { Section } from "@/components/ui/Section";
import { Tag, appointmentTone, type TagTone } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonStyles } from "@/components/ui/Button";
import { Sparkline } from "@/components/ui/Sparkline";
import { EmergencyCard } from "@/components/emergency/EmergencyCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { CriticalConditionModal } from "@/components/modes/CriticalConditionModal";
import { PregnancyHero, PregnancyTimeline } from "@/components/modes/PregnancyHero";
import { CriticalHero } from "@/components/modes/CriticalHero";
import { ElderlyHero } from "@/components/modes/ElderlyHero";
import { MedScheduleCard } from "@/components/modes/MedScheduleCard";
import { ModeSupportBanner } from "@/components/modes/ModeSupportBanner";
import {
  AllergyIcon,
  BellIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentIcon,
  DropIcon,
  FlowerIcon,
  HeartIcon,
  LeafIcon,
  PlusIcon,
  PillIcon,
  ScanIcon,
  SearchIcon,
  UsersIcon,
  VitalsIcon,
  WeightIcon,
} from "@/components/icons";

function timeGreeting(): { text: string; mark: string } {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", mark: "☀️" };
  if (h < 17) return { text: "Good afternoon", mark: "☀️" };
  return { text: "Good evening", mark: "🌙" };
}

/** The coral disc that carries a card head's icon — 32px in a head, 44px in a row. */
function Disc({ size = 32, children }: { size?: number; children: ReactNode }) {
  return (
    <span
      className="grid flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent"
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}

/** A card head: coral disc, plain title, one coral link out. */
function CardHead({
  icon,
  title,
  titleId,
  action,
}: {
  icon: ReactNode;
  title: string;
  titleId?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Disc size={32}>{icon}</Disc>
      <h2
        id={titleId}
        className="min-w-0 flex-1 truncate text-mhl-card font-bold tracking-[-0.015em] text-mhl-ink"
      >
        {title}
      </h2>
      {action}
    </div>
  );
}

/** The "View all" link that ends every card head. */
function CardOut({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`flex-none whitespace-nowrap rounded-full px-1 text-[0.845rem] font-semibold text-mhl-accent transition-colors hover:text-mhl-accent-strong ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}

/** The gentle in/out-of-range cue on a reading — always beside the number, never
    alone. Worded (Normal / Low / High) so it survives a glance. */
function NumberStatus({
  reading,
  values,
}: {
  reading: VitalReading;
  values?: number[];
}) {
  const status = vitalStatus(reading);
  if (!status) {
    // No band exists for this measure (weight, height): when there's a trail of
    // readings we mark it Stable — steady, not a caution.
    if (values && values.length > 1) return <Tag tone="stable">Stable</Tag>;
    return null;
  }
  const tone: TagTone = status === "normal" ? "ok" : "watch";
  const label = status === "normal" ? "Normal" : status === "low" ? "Low" : "High";
  return <Tag tone={tone}>{label}</Tag>;
}

/** A row icon, per measure — a heart for pressure, a drop for sugar, a scale for
    weight, the plain reading mark otherwise. */
function VitalIcon({ reading }: { reading: VitalReading }) {
  if (reading.vitalType === "BLOOD_PRESSURE") return <HeartIcon size={21} />;
  if (reading.vitalType === "BLOOD_GLUCOSE") return <DropIcon size={21} />;
  if (reading.vitalType === "WEIGHT") return <WeightIcon size={21} />;
  return <VitalsIcon size={21} />;
}

/** The four facts in the summary strip — each a pointer into the page behind it. */
function StripCell({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub: ReactNode;
}) {
  return (
    <div className="flex h-full min-w-0 items-center gap-2.5 bg-mhl-surface px-3.5 py-4 sm:gap-3.5 sm:px-5 sm:py-[1.15rem]">
      <Disc size={44}>{icon}</Disc>
      <div className="min-w-0">
        <p className="text-[0.83rem] leading-snug text-mhl-muted sm:text-[0.875rem]">{label}</p>
        <p className="text-[1.06rem] font-bold leading-[1.2] tracking-[-0.022em] text-mhl-ink [font-variant-numeric:tabular-nums] sm:text-[1.28rem]">
          {value}
        </p>
        <p className="text-[0.8rem] leading-snug text-mhl-muted sm:text-[0.845rem]">{sub}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { mode, meta: modeMeta, criticalConditionId } = useAppMode();
  const { canEdit, isProxyView, activeOwnerName, activeOwnerId, grants } = useCareProxy();
  const ModeIcon = modeMeta.Icon;
  const records = useRecords();
  const { profile, allergies, medications, appointments, conditions, documents, vitals } =
    records;
  const { active, activeLabel, deactivate, pregnancy } = useContexts();

  // The prioritised reading of the record, only when a context is open. Building it is
  // read-only — it doesn't touch the record, and the rest of the dashboard below shows
  // everything as usual either way.
  const contextProfile = useMemo(
    () => (active && active.id ? buildContextProfile({ bundle: records, ctx: active }) : null),
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
  const displayName = isProxyView ? activeOwnerName : (user?.name ?? profile.fullName);
  const greeting = timeGreeting();
  const critical = allergies.filter((a) => isCriticalAllergy(a.severity));
  const activeMeds = medications.filter((m) => m.active);

  // The latest reading per measure, most-recently-measured first, capped at three —
  // enough to show momentum without turning the dashboard into the full tracker.
  const recentVitals = useMemo(() => {
    const groups = new Map<string, VitalReading[]>();
    for (const v of vitals) {
      const key =
        v.vitalType === "CUSTOM"
          ? `CUSTOM:${(v.label ?? "").trim().toLowerCase()}`
          : v.vitalType;
      const arr = groups.get(key);
      if (arr) arr.push(v);
      else groups.set(key, [v]);
    }
    const rows = Array.from(groups.values()).map((readings) => {
      const chrono = [...readings].sort(
        (a, b) => +new Date(a.measuredAt) - +new Date(b.measuredAt),
      );
      return {
        latest: chrono[chrono.length - 1],
        values: chrono.slice(-16).map((r) => r.value),
      };
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

  interface ActivityItem {
    id: string;
    to: string;
    icon: typeof DocumentIcon;
    label: string;
    kind: string;
    when: string;
  }

  // What changed, in the order it changed: kind · date rides one line under the
  // title, so the row carries a chevron and stays one tap wide. (No invented
  // events — the data model has no audit trail, so only real records appear.)
  const activity: ActivityItem[] = useMemo(() => {
    const docs: ActivityItem[] = documents.map((d: HealthDocument) => ({
      id: d.id,
      to: `/app/records/documents/${d.id}`,
      icon: d.docType === "SCAN" ? ScanIcon : DocumentIcon,
      label: d.title,
      kind: d.docType === "SCAN" ? "Scan" : (DOCUMENT_TYPE_LABELS[d.docType] ?? "Document"),
      when: d.uploadedAt,
    }));
    const visits: ActivityItem[] = appointments
      .filter((a: Appointment) => a.status === "ATTENDED")
      .map((a: Appointment) => ({
        id: a.id,
        to: "/app/appointments",
        icon: CalendarIcon,
        label: a.title,
        kind: "Visit attended",
        when: a.scheduledFor,
      }));
    return [...docs, ...visits]
      .sort((a, b) => +new Date(b.when) - +new Date(a.when))
      .slice(0, 4);
  }, [documents, appointments]);

  // Heart first, then the rest chronologically — the order the reference lays down.
  const orderedVitals = useMemo(() => {
    const rank = (v: VitalReading) => (v.vitalType === "BLOOD_PRESSURE" ? 0 : 1);
    return [...recentVitals].sort(
      (a, b) =>
        rank(a.latest) - rank(b.latest) ||
        +new Date(b.latest.measuredAt) - +new Date(a.latest.measuredAt),
    );
  }, [recentVitals]);

  // Care proxy — who else can open the record on screen. Only *active* grants
  // count; an unanswered invite is not yet a trusted contact.
  const trustedContacts = useMemo(
    () =>
      grants
        .filter((g) => g.ownerUserId === activeOwnerId && g.status === "ACTIVE")
        .map((g) => g.proxyName.trim() || g.proxyEmail)
        .filter(Boolean),
    [grants, activeOwnerId],
  );

  // ---- Condition-aware heroes: a lens over the same record. Each mode pulls
  // its own focus forward; nothing here filters the record or writes to it. ----
  const [focusOpen, setFocusOpen] = useState(false);
  const focusCondition = useMemo(
    () =>
      conditions.find((c) => c.id === criticalConditionId) ??
      conditions.find((c) => c.status === "ACTIVE") ??
      conditions[0],
    [conditions, criticalConditionId],
  );
  const pregView = useMemo(() => (pregnancy ? pregnancyView(pregnancy) : null), [pregnancy]);
  // Blood pressure and weight are the two numbers an antenatal visit always asks for.
  const pregVitals = useMemo(
    () =>
      orderedVitals.filter(
        ({ latest }) =>
          latest.vitalType === "BLOOD_PRESSURE" || latest.vitalType === "WEIGHT",
      ),
    [orderedVitals],
  );

  return (
    <div className="mhl-dash" data-focus={mode === "standard" ? "normal" : mode}>
      {/* ============================ HEAD ============================ */}
      {/* The greeting holds its place; every verb the page offers (mode chip,
          search, notifications, the one coral action) sits on the same line at
          the right edge. Search is drawn because the composition asks for it —
          a real input, ready for the index that lands behind it. */}
      <header>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-start sm:justify-between sm:gap-x-5">
          <div className="min-w-0">
            <h1 className="min-w-0 text-mhl-h1 font-bold tracking-[-0.028em] text-mhl-ink [text-wrap:balance]">
              {greeting.text}, {firstName}{" "}
              <span aria-hidden="true">{greeting.mark}</span>
            </h1>
            <p className="mt-1.5 min-w-0 text-mhl-body text-mhl-muted [text-wrap:pretty]">
              {isProxyView
                ? `Here's where ${activeOwnerName}'s record stands today.`
                : modeMeta.greeting}
            </p>
          </div>

          <div className="flex w-full flex-none flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
            {contextProfile ? (
              <Link
                to={`/app/contexts/${contextProfile.ctx.id}`}
                className="mhl-interactive inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full bg-mhl-accent px-3.5 py-1.5 text-mhl-fine font-semibold text-white hover:brightness-95"
              >
                <ModeIcon size={15} />
                {activeLabel} profile
              </Link>
            ) : (
              mode !== "standard" && (
                <Link
                  to="/app/profile"
                  className="mhl-interactive inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full bg-mhl-accent-lo px-3.5 py-1.5 text-mhl-fine font-semibold text-mhl-accent hover:bg-mhl-accent/15"
                >
                  <ModeIcon size={15} />
                  {modeMeta.label} mode
                </Link>
              )
            )}
            {mode !== "elderly" && (
              <label className="hidden min-h-11 w-52 min-w-0 cursor-text items-center gap-2 rounded-[0.7rem] border border-mhl-rule bg-mhl-surface px-3.5 text-mhl-faint transition-colors focus-within:border-mhl-accent/60 focus-within:ring-1 focus-within:ring-mhl-accent/30 sm:flex lg:w-60">
                <span className="sr-only">Search your records</span>
                <SearchIcon size={17} />
                <input
                  type="search"
                  placeholder="Search your records…"
                  className="min-w-0 flex-1 bg-transparent text-mhl-fine text-mhl-ink outline-none placeholder:text-mhl-faint"
                />
              </label>
            )}
            <button
              type="button"
              aria-label="Notifications"
              className="relative grid h-11 w-11 flex-none place-items-center rounded-full text-mhl-muted transition-colors hover:bg-mhl-sunk hover:text-mhl-ink"
            >
              <BellIcon size={21} />
              <span className="absolute right-2.5 top-2.5 h-[0.45rem] w-[0.45rem] rounded-full bg-mhl-accent shadow-[0_0_0_2px_var(--color-mhl-bg)]" />
            </button>
            {canEdit && (
              <Link
                to="/app/add?type=record"
                className={`${buttonStyles("primary", "md")} flex-none whitespace-nowrap rounded-[0.65rem] px-4 shadow-[0_6px_16px_-8px_oklch(0.45_0.15_28/0.6)] sm:px-5`}
              >
                <PlusIcon size={18} strokeWidth={2.5} />
                Add record
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* The context's leading records — a prioritised reading, not a filtered one. The
          complete dashboard carries on below, exactly as it does with no profile open. */}
      {contextProfile && contextHighlights.length > 0 && (
        <Section
          icon={<VitalsIcon size={18} />}
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
          <ContextRowList rows={contextHighlights} className="mt-3" />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mhl-rule pt-3">
            <Link
              to="/app/contexts"
              className="text-mhl-fine font-semibold text-mhl-muted hover:text-mhl-ink"
            >
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

      {/* ========================= MODE HEROES ========================= */}
      {/* Each mode pulls its focus forward here, mirroring its preview;
          the complete dashboard carries on below, exactly as in Normal. */}
      {mode === "pregnancy" && pregnancy && (
        <PregnancyHero
          view={pregView}
          nextVisit={nextVisit}
          docCount={documents.length}
          userName={displayName}
          vitals={pregVitals.map(({ latest }) => ({
            label: vitalName(latest),
            value: formatVitalValue(latest),
            when: formatDate(latest.measuredAt),
          }))}
        />
      )}

      {mode === "critical" && focusCondition && (
        <>
          <CriticalHero
            condition={focusCondition}
            meds={medications}
            vitals={vitals}
            nextVisit={nextVisit}
            onChangeFocus={() => setFocusOpen(true)}
          />
          <CriticalConditionModal
            open={focusOpen}
            mode="critical"
            onClose={() => setFocusOpen(false)}
            onDone={() => setFocusOpen(false)}
          />
        </>
      )}

      {mode === "elderly" && (
        <ElderlyHero
          bloodType={profile.bloodType}
          genotype={profile.genotype}
          activeMeds={activeMeds}
          conditionCount={
            conditions.filter((c) => c.status === "ACTIVE").length || conditions.length
          }
          contactCount={trustedContacts.length}
          proxyName={trustedContacts[0]}
        />
      )}

      {/* =========================== ALERT ============================ */}
      {/* Most urgent thing first: tint, icon, weight AND wording all carry it,
          on two lines with one link out. */}
      {critical.length > 0 && (
        <section
          aria-labelledby="alert-title"
          className="flex min-w-0 items-start gap-3.5 rounded-mhl border border-[oklch(0.87_0.055_28)] bg-mhl-accent-lo/70 px-5 py-4"
        >
          <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center text-mhl-danger">
            <AllergyIcon size={22} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h2
              id="alert-title"
              className="text-[1.06rem] font-bold leading-[1.35] text-mhl-danger"
            >
              {critical.length === 1
                ? "A life-threatening allergy is on file"
                : "Life-threatening allergies on file"}
            </h2>
            <p className="mt-1 text-[0.9rem] leading-relaxed text-mhl-ink [text-wrap:pretty]">
              <b>{critical.map((a) => a.substance).join(", ")}</b> — this is shown on{" "}
              {isProxyView ? "their" : "your"} emergency card.{" "}
              <Link
                to="/app/allergies"
                className="font-semibold text-mhl-danger underline decoration-[1.5px] underline-offset-2 hover:text-mhl-accent-strong"
              >
                Review allergies
              </Link>
            </p>
          </div>
        </section>
      )}

      {/* ======================== SUMMARY STRIP ======================= */}
      {/* Four facts, one card, hairlines between — the record's index. Every
          value is a pointer into a page behind it, never a score. */}
      <section
        aria-label="Your health at a glance"
        className="min-w-0 overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-rule shadow-mhl"
      >
        <div className="grid grid-cols-2 gap-px min-[560px]:grid-cols-4">
          <Link to="/app/profile" className="min-w-0 transition-colors hover:bg-mhl-sunk">
            <StripCell
              icon={<DropIcon size={20} />}
              label="Blood type"
              value={profile.bloodType ?? "—"}
              sub={`Genotype ${profile.genotype ?? "—"}`}
            />
          </Link>
          <Link to="/app/allergies" className="min-w-0 transition-colors hover:bg-mhl-sunk">
            <StripCell
              icon={<FlowerIcon size={20} />}
              label={allergies.length === 1 ? "Allergy" : "Allergies"}
              value={allergies.length}
              sub={
                critical.length > 0 ? (
                  <span className="font-semibold text-mhl-accent">
                    {critical.length} {critical.length === 1 ? "needs" : "need"} care
                  </span>
                ) : (
                  "None critical"
                )
              }
            />
          </Link>
          <Link
            to="/app/medications"
            className="min-w-0 transition-colors hover:bg-mhl-sunk"
          >
            <StripCell
              icon={<PillIcon size={20} />}
              label="Active medications"
              value={activeMeds.length}
              sub={`${medications.length} in total`}
            />
          </Link>
          <Link
            to="/app/appointments"
            className="min-w-0 transition-colors hover:bg-mhl-sunk"
          >
            <StripCell
              icon={<CalendarIcon size={20} />}
              label="Last visit"
              value={lastVisit ? formatDate(lastVisit.scheduledFor) : "—"}
              sub={lastVisit ? lastVisit.title : "No visits yet"}
            />
          </Link>
        </div>
      </section>

      <div className="mhl-dash__cols">
      <div className="mhl-dash__left flex min-w-0 flex-col gap-5">
      {/* ==================== HEALTH MEASUREMENTS ===================== */}
        {/* One row per vital: what it is, when it was measured, the number (the
            biggest thing in the row, tabular), the worded cue, and the shape of
            the last readings. The trend shows from 640px up. */}
        <section
          aria-labelledby="meas-title"
          className="mhl-dash__meas min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-1 pt-5 shadow-mhl"
        >
          <CardHead
            icon={<VitalsIcon size={16} />}
            title={
              mode === "pregnancy"
                ? "Key pregnancy information"
                : mode === "critical" && focusCondition
                  ? "Recent measurements"
                  : "Health measurements"
            }
            titleId="meas-title"
            action={<CardOut to="/app/measurements">View all</CardOut>}
          />
          {orderedVitals.length > 0 ? (
            <div className="mt-2">
              {orderedVitals.map(({ latest, values }) => {
                const unit = latest.unit || VITAL_META[latest.vitalType]?.unit || "";
                const full = formatVitalValue(latest);
                const figure =
                  unit && full.endsWith(` ${unit}`) ? full.slice(0, -(unit.length + 1)) : full;
                return (
                  <div
                    key={latest.id}
                    className="flex min-w-0 items-center gap-3.5 border-t border-mhl-rule py-4 first:border-t-0"
                  >
                    <Disc size={44}>
                      <VitalIcon reading={latest} />
                    </Disc>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.99rem] font-semibold text-mhl-ink">
                        {vitalName(latest)}
                      </p>
                      <p className="truncate text-[0.845rem] text-mhl-muted">
                        {formatDate(latest.measuredAt)}
                      </p>
                    </div>
                    <p className="flex flex-none items-baseline gap-[0.18rem] whitespace-nowrap text-[1.06rem] font-bold tracking-[-0.01em] text-mhl-ink [font-variant-numeric:tabular-nums]">
                      <span>{figure}</span>
                      {unit && (
                        <span className="text-[0.7em] font-semibold text-mhl-muted">{unit}</span>
                      )}
                    </p>
                    <span className="hidden flex-none sm:block">
                      <NumberStatus reading={latest} values={values} />
                    </span>
                    {values.length > 1 && (
                      <span className="hidden w-[4.5rem] flex-none sm:block">
                        <Sparkline
                          values={values}
                          width={78}
                          height={34}
                          strokeWidth={1.8}
                          className={
                            latest.vitalType === "WEIGHT"
                              ? "block h-10 w-full text-mhl-info"
                              : "block h-10 w-full text-mhl-good"
                          }
                        />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 mb-4">
              <EmptyState
                icon={<VitalsIcon size={22} />}
                title="No measurements yet"
                description="Add a reading and this card becomes the shape of your numbers — one row each, with the trend behind it."
                action={
                  canEdit ? (
                    <Link
                      to="/app/measurements"
                      className={buttonStyles("primary", "md")}
                    >
                      <PlusIcon size={18} strokeWidth={2.25} />
                      Add a measurement
                    </Link>
                  ) : undefined
                }
              />
            </div>
          )}
        </section>

        {/* Medication reminders — in elderly mode this is the most prominent
            feature (top of the column); in other modes it sits in the flow. */}
        {(mode === "elderly" || mode === "critical" || mode === "pregnancy") && (
          <div className="mhl-dash__meds min-w-0">
            <MedScheduleCard meds={activeMeds} large={mode === "elderly"} />
          </div>
        )}

        {/* Pregnancy timeline — trimester track, mirroring the preview. */}
        {mode === "pregnancy" && pregnancy && (
          <div className="mhl-dash__timeline min-w-0">
            <PregnancyTimeline weeks={pregView?.age?.weeks ?? null} />
          </div>
        )}

        {/* Critical care plan — the four steady habits, mirroring the preview. */}
        {mode === "critical" && focusCondition && (
          <section
            aria-labelledby="careplan-title"
            className="min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl"
          >
            <CardHead
              icon={<HeartIcon size={16} />}
              title={`${focusCondition.name} care plan`}
              titleId="careplan-title"
              action={<CardOut to="/app/contexts">View details</CardOut>}
            />
            <p className="mt-2 text-mhl-fine text-mhl-muted">Your care plan includes</p>
            <ul className="mt-2.5 space-y-2">
              {[
                "Daily controller medication",
                "Avoid known triggers",
                "Use reliever inhaler as needed",
                "Regular follow-ups",
              ].map((step) => (
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
                      <path
                        d="m5 13 4 4L19 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {step}
                </li>
              ))}
            </ul>
          </section>
        )}

      {/* ======================= RECENT ACTIVITY ====================== */}
      <section
          aria-labelledby="activity-title"
          className="mhl-dash__act min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-1 pt-5 shadow-mhl"
        >
          <CardHead
            icon={<ClockIcon size={16} />}
            title="Recent activity"
            titleId="activity-title"
            action={<CardOut to="/app/timeline">View all</CardOut>}
          />
          {activity.length > 0 ? (
            <ul className="mt-2">
              {activity.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id} className="border-t border-mhl-rule first:border-t-0">
                    <Link
                      to={item.to}
                      className="mhl-interactive group -mx-2 flex min-w-0 items-center gap-3.5 rounded-mhl-sm px-2 py-3.5"
                    >
                      <Disc size={44}>
                        <Icon size={21} />
                      </Disc>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.99rem] font-semibold text-mhl-ink">
                          {item.label}
                        </p>
                        <p className="truncate text-[0.845rem] text-mhl-muted">
                          {item.kind} · {formatDate(item.when)}
                        </p>
                      </div>
                      <span className="flex-none text-mhl-faint transition-transform group-hover:translate-x-0.5 group-hover:text-mhl-accent">
                        <ChevronRightIcon size={17} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-3 mb-4">
              <EmptyState
                icon={<DocumentIcon size={22} />}
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
            </div>
          )}
        </section>
      </div>
      {/* The right column: the card of the record on screen, the next visit, and
          the two things a person acts on. A flex stack, so it stays tight
          against itself however tall the left column's activity card gets. */}
      <div className="mhl-dash__right flex min-w-0 flex-col gap-3.5">
      <EmergencyCard hideManageLink={isProxyView} />

        {/* The next visit. In Pregnancy and Critical the hero already leads with
            it, so the stack card would be a duplicate — keep it only for the
            balanced (Normal) and simplified (Elderly) views. */}
        {(mode === "standard" || mode === "elderly") && (
          <section
            aria-labelledby="upcoming-title"
            className="mhl-dash__upcoming min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl"
          >
            <CardHead
              icon={<CalendarIcon size={16} />}
              title={mode === "elderly" ? "Upcoming appointments" : "What's coming up?"}
              titleId="upcoming-title"
              action={<CardOut to="/app/appointments">View all</CardOut>}
            />
            {nextVisit ? (
              <div className="mt-3 flex min-w-0 items-center gap-3 rounded-mhl-sm bg-mhl-sunk px-3.5 py-3">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-mhl-surface text-mhl-accent shadow-mhl">
                  <CalendarIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.99rem] font-semibold text-mhl-ink">
                    {nextVisit.title}
                  </p>
                  <p className="text-[0.845rem] text-mhl-muted [font-variant-numeric:tabular-nums]">
                    {formatDate(nextVisit.scheduledFor)} · {formatTime(nextVisit.scheduledFor)}
                  </p>
                  {nextVisit.facility && (
                    <p className="truncate text-[0.845rem] text-mhl-muted">
                      {nextVisit.facility}
                    </p>
                  )}
                </div>
                <Tag tone={appointmentTone(nextVisit.status)} className="hidden flex-none sm:inline-flex">
                  {APPOINTMENT_STATUS_LABELS[nextVisit.status]}
                </Tag>
              </div>
            ) : (
              <p className="mt-3 text-mhl-fine text-mhl-muted">
                No visits booked yet.{" "}
                <Link
                  to="/app/appointments"
                  className="font-semibold text-mhl-accent hover:text-mhl-accent-strong"
                >
                  Book one
                </Link>
              </p>
            )}
          </section>
        )}

        {/* Care proxy + quick actions — two small panels side by side, the
            reference's last row. They share a grid so their tops align. */}
        <div className="mhl-dash__side grid min-w-0 gap-3.5 sm:grid-cols-2">
          <section
            aria-labelledby="proxy-title"
            className="min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl"
          >
            <div className="flex items-center gap-2">
              <Disc size={28}>
                <UsersIcon size={15} />
              </Disc>
              <h2
                id="proxy-title"
                className="min-w-0 flex-1 text-[0.9rem] font-bold tracking-[-0.012em] text-mhl-ink"
              >
                Care proxy access
              </h2>
              <CardOut to="/app/proxy" className="whitespace-nowrap text-[0.74rem]">Manage</CardOut>
            </div>
            <p className="mt-2 text-[0.845rem] leading-snug text-mhl-muted [text-wrap:pretty]">
              Give trusted family or friends limited access to your emergency information.
            </p>
            <Link
              to="/app/proxy"
              className="mhl-interactive mhl-row mt-3.5 flex min-w-0 items-center gap-2.5 rounded-mhl-sm bg-mhl-sunk px-3 py-2.5"
            >
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-mhl-surface text-mhl-muted shadow-mhl">
                <UsersIcon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8rem] text-mhl-muted">
                  {trustedContacts.length === 1
                    ? "1 trusted contact"
                    : `${trustedContacts.length} trusted contacts`}
                </span>
                <span className="block truncate text-[0.9rem] font-semibold text-mhl-ink">
                  {trustedContacts.length > 0 ? trustedContacts[0] : "No one yet"}
                </span>
              </span>
              <span className="flex-none text-mhl-faint">
                <ChevronRightIcon size={16} />
              </span>
            </Link>
          </section>

          <QuickActions canEdit={canEdit} />
        </div>
      </div>
      </div>

      {/* Elderly "what else": the three quiet doors — timeline, add, summary —
          in one big-touch card, matching the preview. */}
      {mode === "elderly" && (
        <section
          aria-labelledby="else-title"
          className="min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl"
        >
          <h2 id="else-title" className="text-mhl-card font-bold text-mhl-ink">
            What else would you like to do today?
          </h2>
          <p className="mt-1 text-mhl-body text-mhl-muted">
            View your full timeline, add a record or explore your health summary.
          </p>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <Link
              to="/app/timeline"
              className="flex min-h-12 items-center justify-center rounded-mhl-sm border border-mhl-rule px-4 py-3.5 text-mhl-body font-semibold text-mhl-ink hover:border-mhl-accent/50"
            >
              Explore records
            </Link>
            {canEdit && (
              <Link
                to="/app/add"
                className="flex min-h-12 items-center justify-center rounded-mhl-sm bg-mhl-accent px-4 py-3.5 text-mhl-body font-semibold text-white hover:bg-mhl-accent-strong"
              >
                Add a record
              </Link>
            )}
            <Link
              to="/app/profile"
              className="flex min-h-12 items-center justify-center rounded-mhl-sm border border-mhl-rule px-4 py-3.5 text-mhl-body font-semibold text-mhl-ink hover:border-mhl-accent/50"
            >
              Health summary
            </Link>
          </div>
        </section>
      )}

      {/* Support strip — per-mode care-team banner, mirroring the preview. */}
      {mode !== "standard" && <ModeSupportBanner mode={mode} />}

      <footer className="flex min-w-0 items-center gap-2 pb-1 pt-1 text-mhl-fine text-mhl-muted">
        <span className="flex-none text-mhl-accent/80">
          <LeafIcon size={16} />
        </span>
        <span className="truncate">
          {isProxyView
            ? `${activeOwnerName}'s record. Your health. Your data. Your control.`
            : "Your health. Your data. Your control."}
        </span>
      </footer>
    </div>
  );
}
