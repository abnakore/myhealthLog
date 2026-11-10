/**
 * Pregnancy mode dashboard — the antenatal home screen.
 *
 * Mirrors the pregnancy reference: the dated hero (week + day, due date,
 * progress, trimester), the two quick cards (next visit, record count), the
 * key-reading strip with worded cues, the trimester timeline, then activity,
 * what's coming up, the emergency card and care proxy. All dates come from the
 * pregnancy profile on file — nothing is invented.
 */
import { Link } from "react-router-dom";
import type { Appointment } from "@/types/health";
import type { PregnancyView } from "@/lib/healthContexts";
import type { VitalGroup } from "@/lib/conditionGuide";
import { formatDate } from "@/lib/format";
import { formatVitalValue, vitalName } from "@/types/health";
import { Sparkline } from "@/components/ui/Sparkline";
import { EmergencyCard } from "@/components/emergency/EmergencyCard";
import { PregnancyTimeline } from "@/components/modes/PregnancyHero";
import { WaveArt } from "@/components/ui/Motifs";
import {
  ActivityCard,
  CardOut,
  Disc,
  NumberStatus,
  ProxyAccessCard,
  UpcomingCard,
  VitalIcon,
  type ActivityItem,
} from "./parts";
import {
  CalendarIcon,
  ChevronRightIcon,
  DocumentIcon,
  SproutIcon,
} from "@/components/icons";

/** "Week 24, Day 3" — the headline the hero is built around. A pregnancy that has
    ended says where it stands instead of counting weeks that no longer apply. */
function ageHeadline(view: PregnancyView | null): string {
  if (!view) return "Your pregnancy";
  if (view.statusLabel !== "Ongoing") {
    return view.ageLabel ? `${view.statusLabel} · ${view.ageLabel}` : view.statusLabel;
  }
  if (!view.age) return "Your pregnancy";
  return `Week ${view.age.weeks}, Day ${view.age.rem}`;
}

/** One labelled fact in the hero's details row. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-mhl-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-mhl-fine font-semibold text-mhl-ink [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

/** One tile in the key-reading strip: label, number, date, worded cue, trend. */
function KeyTile({ group }: { group: VitalGroup }) {
  const { latest, values } = group;
  const full = formatVitalValue(latest);
  return (
    <Link
      to="/app/measurements"
      className="mhl-cardlink group flex min-w-0 flex-col rounded-mhl border border-mhl-rule bg-mhl-surface px-4 pb-4 pt-4 shadow-mhl"
    >
      <div className="flex items-center gap-2.5">
        <Disc size={36}>
          <VitalIcon reading={latest} size={18} />
        </Disc>
        <p className="min-w-0 flex-1 truncate text-[0.85rem] font-semibold text-mhl-muted">
          {vitalName(latest)}
        </p>
      </div>
      <p className="mt-3 truncate text-[1.3rem] font-bold leading-none tracking-[-0.025em] text-mhl-ink [font-variant-numeric:tabular-nums]">
        {full}
      </p>
      <div className="mt-2 flex min-w-0 items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[0.8rem] text-mhl-muted">Last: {formatDate(latest.measuredAt)}</p>
          <span className="mt-1 inline-flex">
            <NumberStatus reading={latest} values={values} />
          </span>
        </div>
        {values.length > 1 && (
          <span className="flex-none">
            <Sparkline values={values} width={64} height={24} className="text-mhl-accent" />
          </span>
        )}
      </div>
    </Link>
  );
}

export interface PregnancyDashProps {
  view: PregnancyView | null;
  weeks: number | null;
  nextVisits: Appointment[];
  docCount: number;
  keyReadings: VitalGroup[];
  activity: ActivityItem[];
  trustedContacts: string[];
  /** Opens the dates form — the home screen no longer carries the mode banner. */
  onEditDates?: () => void;
}

export function PregnancyDash({
  view,
  weeks,
  nextVisits,
  docCount,
  keyReadings,
  activity,
  trustedContacts,
  onEditDates,
}: PregnancyDashProps) {
  const ongoing = view?.statusLabel === "Ongoing";
  const pct =
    view?.age && ongoing
      ? Math.min(100, Math.round(((view.age.weeks * 7 + view.age.rem) / 280) * 100))
      : null;
  const next = nextVisits[0];
  const obstetric = view
    ? [
        view.gravida != null ? `${view.gravida} ${view.gravida === 1 ? "pregnancy" : "pregnancies"}` : null,
        view.para != null ? `${view.para} ${view.para === 1 ? "birth" : "births"}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <>
      {/* The dated hero — how far along, when due, and the shape of the term. */}
      <section
        aria-label="Current pregnancy"
        className="mhl-mode-hero relative min-w-0 overflow-hidden rounded-mhl border border-mhl-rule bg-gradient-to-br from-mhl-accent-lo/80 via-mhl-surface to-mhl-surface p-5 sm:p-6"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-mhl-accent/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-3 bottom-2 hidden text-mhl-accent/25 sm:block"
        >
          <WaveArt className="block h-28 w-44" />
        </div>
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-mhl-fine font-bold uppercase tracking-[0.08em] text-mhl-accent">
              <SproutIcon size={15} />
              Current pregnancy
            </p>
            {onEditDates && (
              <button
                type="button"
                onClick={onEditDates}
                className="mhl-interactive inline-flex min-h-9 items-center rounded-full px-2.5 text-mhl-fine font-semibold text-mhl-accent hover:bg-mhl-accent/10"
              >
                Edit dates
              </button>
            )}
          </div>
          <h2 className="mt-2 text-mhl-figure font-bold tracking-[-0.03em] text-mhl-ink">
            {ageHeadline(view)}
          </h2>
          <p className="mt-1.5 text-mhl-body text-mhl-muted">
            {view?.dueDateLabel
              ? `Estimated due date: ${view.dueDateLabel}`
              : "Add your dates to see how far along you are."}
          </p>
          {pct != null && (
            <div className="mt-4 max-w-[34rem]">
              <div
                className="h-2.5 overflow-hidden rounded-full bg-mhl-sunk"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Pregnancy progress"
              >
                <div className="h-full rounded-full bg-mhl-accent" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-mhl-fine font-bold text-mhl-ink">{view?.trimesterLabel}</p>
                <p className="text-mhl-fine text-mhl-muted">
                  {pct}%. Your baby is growing, and so are you.
                </p>
              </div>
            </div>
          )}

          {/* The dates and history collected by the form, so the home screen shows
              what was entered rather than only the week it implies. */}
          {view && (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-mhl-rule/70 pt-3.5 sm:grid-cols-4">
              <Fact label="Last period" value={view.lastMenstrualPeriodLabel ?? "Not recorded"} />
              <Fact label="Due" value={view.dueDateLabel ?? "Not recorded"} />
              <Fact label="Pregnancies" value={obstetric || "Not recorded"} />
              <Fact
                label="Complications"
                value={view.complications.length > 0 ? view.complications.join(", ") : "None recorded"}
              />
            </dl>
          )}
          {view?.delivery && (
            <p className="mt-3 text-mhl-fine text-mhl-muted">
              <span className="font-semibold text-mhl-ink">How it ended:</span> {view.delivery}
            </p>
          )}
          {view?.notes && <p className="mt-2 text-mhl-fine text-mhl-muted">{view.notes}</p>}
        </div>
      </section>

      {/* The two quick cards: the next visit, and what's on file. */}
      <section aria-label="Pregnancy shortcuts" className="grid min-w-0 gap-3.5 sm:grid-cols-2">
        <Link
          to="/app/appointments"
          className="mhl-cardlink group flex min-w-0 items-center gap-3.5 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 py-4 shadow-mhl"
        >
          <Disc size={44}>
            <CalendarIcon size={20} />
          </Disc>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.85rem] font-semibold text-mhl-muted">Next antenatal visit</p>
            {next ? (
              <>
                <p className="mt-0.5 truncate text-mhl-lead font-bold text-mhl-ink [font-variant-numeric:tabular-nums]">
                  {formatDate(next.scheduledFor)}
                </p>
                {next.facility && <p className="truncate text-mhl-fine text-mhl-muted">{next.facility}</p>}
              </>
            ) : (
              <p className="mt-0.5 text-mhl-fine text-mhl-muted">
                No visits booked yet.{" "}
                <span className="font-semibold text-mhl-accent">Book one</span>
              </p>
            )}
          </div>
          <span className="flex-none text-mhl-faint transition-transform group-hover:translate-x-0.5 group-hover:text-mhl-accent">
            <ChevronRightIcon size={17} />
          </span>
        </Link>
        <Link
          to="/app/documents"
          className="mhl-cardlink group flex min-w-0 items-center gap-3.5 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 py-4 shadow-mhl"
        >
          <Disc size={44}>
            <DocumentIcon size={20} />
          </Disc>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.85rem] font-semibold text-mhl-muted">Pregnancy records</p>
            <p className="mt-0.5 truncate text-mhl-lead font-bold text-mhl-ink">
              {docCount} {docCount === 1 ? "document" : "documents"}
            </p>
            <p className="truncate text-mhl-fine text-mhl-muted">Scans, lab results &amp; notes</p>
          </div>
          <span className="flex-none text-mhl-faint transition-transform group-hover:translate-x-0.5 group-hover:text-mhl-accent">
            <ChevronRightIcon size={17} />
          </span>
        </Link>
      </section>

      {/* The key readings an antenatal visit always asks for. */}
      {keyReadings.length > 0 && (
        <section aria-labelledby="preg-key-title" className="min-w-0">
          <div className="mb-3 flex items-center gap-2.5">
            <h2
              id="preg-key-title"
              className="min-w-0 flex-1 text-mhl-card font-bold tracking-[-0.015em] text-mhl-ink"
            >
              Key pregnancy information
            </h2>
            <CardOut to="/app/measurements">View all</CardOut>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3.5 min-[560px]:grid-cols-4">
            {keyReadings.slice(0, 4).map((g) => (
              <KeyTile key={g.latest.id} group={g} />
            ))}
          </div>
        </section>
      )}

      {/* The trimester track — where today sits in the term. */}
      {weeks != null && (
        <div className="min-w-0">
          <PregnancyTimeline weeks={weeks} />
        </div>
      )}

      <div className="mhl-dash__cols">
        <div className="mhl-dash__left flex min-w-0 flex-col gap-5">
          <ActivityCard items={activity} />
        </div>

        {/* The right column: the card of record, who can help, what's next. */}
        <div className="mhl-dash__right flex min-w-0 flex-col gap-3.5">
          <EmergencyCard />
          <ProxyAccessCard
            contacts={trustedContacts}
            description="Give trusted family or friends limited access to your pregnancy and health information."
          />
          <UpcomingCard
            visits={nextVisits}
            title="What's coming up?"
            empty={
              <>
                No visits booked yet.{" "}
                <Link to="/app/appointments" className="font-semibold text-mhl-accent">
                  Book one
                </Link>
              </>
            }
          />
        </div>
      </div>
    </>
  );
}
