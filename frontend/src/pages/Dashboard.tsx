import { RecordSearch } from "@/components/search/RecordSearch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useAppMode } from "@/store/AppModeContext";
import { useContexts } from "@/store/ContextsContext";
import { pregnancyView } from "@/lib/healthContexts";
import { emptyPregnancyContext } from "@/types/context";
import { PregnancyModal } from "@/components/context/PregnancyModal";
import { groupVitals, type VitalGroup } from "@/lib/conditionGuide";
import {
  VITAL_META,
  formatVitalValue,
  isCriticalAllergy,
  vitalName,
  type VitalReading,
} from "@/types/health";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonStyles } from "@/components/ui/Button";
import { Sparkline } from "@/components/ui/Sparkline";
import { Avatar } from "@/components/ui/Avatar";
import { EmergencyCard } from "@/components/emergency/EmergencyCard";
import { CriticalConditionModal } from "@/components/modes/CriticalConditionModal";
import { ModeSupportBanner } from "@/components/modes/ModeSupportBanner";
import { ElderlyDash } from "@/components/dashboard/ElderlyDash";
import { CriticalDash } from "@/components/dashboard/CriticalDash";
import { PregnancyDash } from "@/components/dashboard/PregnancyDash";
import { FocusStrip } from "@/components/dashboard/FocusStrip";
import {
  Disc,
  CardHead,
  CardOut,
  NumberStatus,
  VitalIcon,
  StripCell,
  ProxyAccessCard,
  UpcomingCard,
  buildActivity,
} from "@/components/dashboard/parts";
import {
  AllergyIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentIcon,
  DropIcon,
  FlowerIcon,
  LeafIcon,
  MoonIcon,
  PlusIcon,
  PillIcon,
  SunIcon,
  VitalsIcon,
} from "@/components/icons";

/** A stable empty shell, so the dates form only re-seeds when it's opened. */
const EMPTY_PREGNANCY = emptyPregnancyContext();

/** The greeting and the mark beside it — a drawn sun or moon, never an emoji. */
function timeGreeting(): { text: string; Icon: typeof SunIcon } {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", Icon: SunIcon };
  if (h < 17) return { text: "Good afternoon", Icon: SunIcon };
  return { text: "Good evening", Icon: MoonIcon };
}

export default function Dashboard() {
  const { user } = useAuth();
  const { mode, meta: modeMeta, criticalConditionId } = useAppMode();
  const { canEdit, isProxyView, activeOwnerName, activeOwnerId, grants } = useCareProxy();
  const records = useRecords();
  const { profile, allergies, medications, appointments, conditions, documents, vitals } =
    records;
  // A mode is a lens over one record: the dashboard below is the same record in
  // all four, and the home screen carries no extra banner about it — the rail
  // names the mode and each mode's own hero states what it brings forward.
  const { pregnancy, updatePregnancy } = useContexts();

  const firstName = (user?.name ?? profile.fullName).split(" ")[0];
  const greeting = timeGreeting();
  const GreetingMark = greeting.Icon;
  const critical = allergies.filter((a) => isCriticalAllergy(a.severity));
  const activeMeds = medications.filter((m) => m.active);

  // Every reading on the record, grouped per measure — the pool each mode
  // picks its readings from.
  const vitalGroups = useMemo(() => groupVitals(vitals), [vitals]);

  // The latest reading per measure, most-recently-measured first, capped at three —
  // enough to show momentum without turning the dashboard into the full tracker.
  const recentVitals = useMemo(() => vitalGroups.slice(0, 3), [vitalGroups]);

  const lastVisit = useMemo(
    () =>
      [...appointments]
        .filter((a) => a.status === "ATTENDED")
        .sort((a, b) => +new Date(b.scheduledFor) - +new Date(a.scheduledFor))[0],
    [appointments],
  );

  const upcoming = useMemo(() => {
    const now = Date.now();
    return [...appointments]
      .filter((a) => a.status === "SCHEDULED" && +new Date(a.scheduledFor) >= now)
      .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor));
  }, [appointments]);

  // What changed, in the order it changed: kind · date rides one line under the
  // title, so the row carries a chevron and stays one tap wide. (No invented
  // events — the data model has no audit trail, so only real records appear.)
  const activity = useMemo(() => buildActivity(documents, appointments), [documents, appointments]);

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
  const [datesOpen, setDatesOpen] = useState(false);
  const focusCondition = useMemo(
    () =>
      conditions.find((c) => c.id === criticalConditionId) ??
      conditions.find((c) => c.status === "ACTIVE") ??
      conditions[0],
    [conditions, criticalConditionId],
  );
  const pregView = useMemo(() => (pregnancy ? pregnancyView(pregnancy) : null), [pregnancy]);
  // The readings an antenatal visit asks for: weight, pressure, sugar, iron-adjacent.
  const pregReadings: VitalGroup[] = useMemo(() => {
    const rank = (t: VitalReading["vitalType"]) =>
      t === "BLOOD_PRESSURE" ? 0 : t === "WEIGHT" ? 1 : t === "BLOOD_GLUCOSE" ? 2 : 3;
    return [...vitalGroups].sort(
      (a, b) => rank(a.latest.vitalType) - rank(b.latest.vitalType),
    );
  }, [vitalGroups]);

  // The per-mode sub-line under the greeting: plain in Normal, named after the
  // focus in the others, exactly as the references word it.
  const subline = isProxyView
    ? `Here's where ${activeOwnerName}'s record stands today.`
    : mode === "critical" && focusCondition
      ? `Here's your ${focusCondition.name.toLowerCase()} overview and what matters most right now.`
      : mode === "pregnancy" && pregView?.age
        ? `You're currently ${pregView.age.weeks} weeks pregnant. Here's your pregnancy overview.`
        : modeMeta.greeting;

  // In Pregnancy and Critical the reference puts Add record in the rail (and on
  // mobile's tab bar), so the dashboard header doesn't repeat it.
  const headerShowsAdd = canEdit && (mode === "standard" || mode === "elderly");

  return (
    <div className="mhl-dash" data-focus={mode === "standard" ? "normal" : mode}>
      {/* ============================ HEAD ============================ */}
      {/* The greeting holds its place; every verb the page offers (mode chip,
          search, notifications, the one coral action) sits on the same line at
          the right edge. Critical mode wears a small eyebrow above — the
          reference labels the mode before it greets. */}
      <header>
        {mode === "critical" && (
          <p className="mb-1.5 text-[0.76rem] font-bold uppercase tracking-[0.14em] text-mhl-accent">
            Critical condition mode
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-start sm:justify-between sm:gap-x-5">
          <div className="min-w-0">
            <h1 className="min-w-0 text-mhl-h1 font-bold tracking-[-0.028em] text-mhl-ink [text-wrap:balance]">
              {greeting.text}, {firstName}{" "}
              <span
                aria-hidden="true"
                className="ml-0.5 inline-flex align-[-0.14em] text-mhl-accent"
              >
                <GreetingMark size={24} strokeWidth={1.8} />
              </span>
            </h1>
            <p className="mt-1.5 min-w-0 text-mhl-body text-mhl-muted [text-wrap:pretty]">
              {subline}
            </p>
          </div>

          <div className="flex w-full flex-none flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
            <RecordSearch className="order-last w-full sm:order-none sm:w-52 lg:w-60" />
            <NotificationBell className="h-11 w-11" />
            {/* The reference's top-right corner: search, bell, the person. */}
            <Link
              to="/app/profile"
              aria-label="Open your profile"
              className="mhl-interactive hidden h-11 w-11 flex-none place-items-center rounded-full sm:grid"
            >
              <Avatar name={user?.name ?? "You"} photoUrl={user?.photoUrl ?? undefined} size={38} />
            </Link>
            {headerShowsAdd && (
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

      {/* =========================== ALERT ============================ */}
      {/* Most urgent thing first, in every mode: tint, icon, weight AND wording
          all carry it, on two lines with one link out. Safety outranks any
          mode's composition. */}
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
              <b>{critical.map((a) => a.substance).join(", ")}</b> is shown on{" "}
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

      {/* Every condition and life stage in focus, in rule order. */}
      <FocusStrip canEdit={canEdit} />

      {/* ========================= MODE BODIES ======================== */}
      {/* Each mode lays its own cards, mirroring its reference; the record
          beneath is the same one in all four. */}
      {mode === "elderly" && (
        <ElderlyDash
          bloodType={profile.bloodType}
          genotype={profile.genotype}
          activeMeds={activeMeds}
          conditions={conditions}
          appointments={appointments}
          trustedContacts={trustedContacts}
          canEdit={canEdit}
          activity={activity}
        />
      )}

      {mode === "critical" && focusCondition && (
        <CriticalDash
          condition={focusCondition}
          meds={medications}
          groups={vitalGroups}
          appointments={appointments}
          activity={activity}
          trustedContacts={trustedContacts}
          canEdit={canEdit}
          onChangeFocus={() => setFocusOpen(true)}
        />
      )}

      {mode === "critical" && (
        <CriticalConditionModal
          open={focusOpen}
          mode="critical"
          onClose={() => setFocusOpen(false)}
          onDone={() => setFocusOpen(false)}
        />
      )}

      {mode === "pregnancy" && pregnancy && (
        <PregnancyDash
          view={pregView}
          weeks={pregView?.age?.weeks ?? null}
          nextVisits={upcoming}
          docCount={documents.length}
          keyReadings={pregReadings}
          activity={activity}
          trustedContacts={trustedContacts}
          onEditDates={() => setDatesOpen(true)}
        />
      )}

      {/* The dates form edits the pregnancy already on file — same context, same id. */}
      {mode === "pregnancy" && pregnancy && datesOpen && (
        <PregnancyModal
          open
          current={pregnancy.pregnancy ?? EMPTY_PREGNANCY}
          onSave={(patch) => {
            updatePregnancy(pregnancy.id, patch);
            setDatesOpen(false);
          }}
          onClose={() => setDatesOpen(false)}
        />
      )}

      {/* ====================== NORMAL-MODE BODY ====================== */}
      {mode === "standard" && (
        <>
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
                  value={profile.bloodType ?? "Not set"}
                  sub={`Genotype ${profile.genotype ?? "not set"}`}
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
              <Link to="/app/medications" className="min-w-0 transition-colors hover:bg-mhl-sunk">
                <StripCell
                  icon={<PillIcon size={20} />}
                  label="Active medications"
                  value={activeMeds.length}
                  sub={`${medications.length} in total`}
                />
              </Link>
              <Link to="/app/appointments" className="min-w-0 transition-colors hover:bg-mhl-sunk">
                <StripCell
                  icon={<CalendarIcon size={20} />}
                  label="Last visit"
                  value={lastVisit ? formatDate(lastVisit.scheduledFor) : "None yet"}
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
                  title="Health measurements"
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
                      description="Add a reading and this card becomes the shape of your numbers: one row each, with the trend behind it."
                      action={
                        canEdit ? (
                          <Link to="/app/measurements" className={buttonStyles("primary", "md")}>
                            <PlusIcon size={18} strokeWidth={2.25} />
                            Add a measurement
                          </Link>
                        ) : undefined
                      }
                    />
                  </div>
                )}
              </section>

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

              <UpcomingCard visits={upcoming} title="What's coming up?" />

              <ProxyAccessCard
                contacts={trustedContacts}
                description="Give trusted family or friends limited access to your emergency information."
              />
            </div>
          </div>
        </>
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
