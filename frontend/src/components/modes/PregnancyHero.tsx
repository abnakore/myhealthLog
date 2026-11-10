/**
 * Pregnancy hero — mirrors the pregnancy preview: week/day headline,
 * due date, progress, next visit + records tiles, key-reading tiles.
 */
import { Link } from "react-router-dom";
import type { Appointment } from "@/types/health";
import type { PregnancyView } from "@/lib/healthContexts";
import { formatDate } from "@/lib/format";
import { HeroEyebrow, HeroShell, PortraitArt } from "./ModeHeroShell";
import { CalendarIcon, SproutIcon, VitalsIcon } from "@/components/icons";

export function PregnancyHero({
  view,
  nextVisit,
  docCount,
  userName,
  vitals,
}: {
  view: PregnancyView | null;
  nextVisit?: Appointment;
  docCount: number;
  userName: string;
  vitals: { label: string; value: string; when: string }[];
}) {
  const pct = view?.age
    ? Math.min(100, Math.round(((view.age.weeks * 7 + view.age.days) / 280) * 100))
    : null;
  return (
    <HeroShell
      eyebrow="Current pregnancy"
      art={
        <PortraitArt
          variant="pregnancy"
          headline="Healthy you. Healthy baby. Brighter tomorrow."
          sub={userName}
        />
      }
    >
      <HeroEyebrow icon={<SproutIcon size={15} />} text="Current pregnancy" />
      <h2 className="mt-2 text-mhl-answer font-bold tracking-[-0.02em] text-mhl-ink">
        {view?.ageLabel ?? "Your pregnancy"}
      </h2>
      <p className="mt-1 text-mhl-fine text-mhl-muted">
        {view?.dueDateLabel ? `Estimated due date: ${view.dueDateLabel}` : "Add your dates to see how far along you are."}
        {view?.trimesterLabel ? ` · ${view.trimesterLabel}` : ""}
      </p>
      {pct != null && (
        <div className="mt-3">
          <div
            className="h-2 overflow-hidden rounded-full bg-mhl-sunk"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Pregnancy progress"
          >
            <div className="h-full rounded-full bg-mhl-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-mhl-fine text-mhl-muted">
            {pct}%. Your baby is growing, and so are you.
          </p>
        </div>
      )}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-mhl-sm bg-mhl-sunk p-3.5">
          <p className="flex items-center gap-1.5 text-mhl-fine font-semibold text-mhl-ink">
            <CalendarIcon size={15} className="text-mhl-accent" /> Next antenatal visit
          </p>
          {nextVisit ? (
            <>
              <p className="mt-1 text-mhl-body font-bold text-mhl-ink">{formatDate(nextVisit.scheduledFor)}</p>
              {nextVisit.facility && <p className="truncate text-mhl-fine text-mhl-muted">{nextVisit.facility}</p>}
            </>
          ) : (
            <p className="mt-1 text-mhl-fine text-mhl-muted">
              No visits booked yet.{" "}
              <Link to="/app/appointments" className="font-semibold text-mhl-accent hover:underline">
                Book one
              </Link>
            </p>
          )}
        </div>
        <div className="rounded-mhl-sm bg-mhl-sunk p-3.5">
          <p className="flex items-center gap-1.5 text-mhl-fine font-semibold text-mhl-ink">
            <VitalsIcon size={15} className="text-mhl-accent" /> Pregnancy records
          </p>
          <p className="mt-1 text-mhl-body font-bold text-mhl-ink">
            {docCount} {docCount === 1 ? "document" : "documents"}
          </p>
          <p className="text-mhl-fine text-mhl-muted">Scans, lab results & notes</p>
        </div>
      </div>
      {vitals.length > 0 && (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {vitals.slice(0, 4).map((v) => (
            <div key={v.label} className="rounded-mhl-sm border border-mhl-rule p-3">
              <p className="text-mhl-fine text-mhl-muted">{v.label}</p>
              <p className="mt-0.5 truncate text-mhl-body font-bold text-mhl-ink">{v.value}</p>
              <p className="truncate text-[0.72rem] text-mhl-faint">{v.when}</p>
            </div>
          ))}
        </div>
      )}
    </HeroShell>
  );
}

/**
 * Pregnancy timeline — the three trimesters with the current one marked,
 * mirroring the preview. Purely visual; dates come from the profile.
 */
export function PregnancyTimeline({ weeks }: { weeks: number | null }) {
  const current = weeks == null ? 0 : weeks <= 12 ? 1 : weeks <= 27 ? 2 : 3;
  const terms = [
    { n: 1, label: "1st Trimester", range: "1–12 wks" },
    { n: 2, label: "2nd Trimester", range: "13–27 wks" },
    { n: 3, label: "3rd Trimester", range: "28–40 wks" },
  ];
  return (
    <section
      aria-label="Pregnancy timeline"
      className="mhl-lift min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-[1.15rem] pb-5 pt-[1.1rem]"
    >
      <h2 className="text-mhl-lead font-bold tracking-[-0.015em] text-mhl-ink">Pregnancy timeline</h2>
      <div className="relative mt-6 px-2 pb-1">
        <div aria-hidden="true" className="absolute left-6 right-6 top-3 h-1 rounded-full bg-mhl-sunk" />
        <div
          aria-hidden="true"
          className="absolute left-6 top-3 h-1 rounded-full bg-mhl-accent"
          style={{ width: current === 0 ? "0%" : current === 1 ? "20%" : current === 2 ? "55%" : "calc(100% - 3rem)" }}
        />
        <div className="relative flex items-start justify-between">
          {terms.map((t) => {
            const done = current > t.n;
            const now = current === t.n;
            return (
              <div key={t.n} className="flex w-24 flex-col items-center text-center">
                {now && weeks != null && (
                  <span className="mb-1.5 rounded-full border border-mhl-accent/40 bg-mhl-accent-lo px-2.5 py-0.5 text-[0.7rem] font-bold text-mhl-accent">
                    Week {weeks}
                  </span>
                )}
                <span
                  className={
                    done
                      ? "grid h-6 w-6 place-items-center rounded-full bg-mhl-accent text-white"
                      : now
                        ? "grid h-7 w-7 place-items-center rounded-full border-2 border-mhl-accent bg-mhl-surface"
                        : "grid h-6 w-6 place-items-center rounded-full border-2 border-mhl-rule bg-mhl-surface"
                  }
                >
                  {done ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : now ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-mhl-accent" />
                  ) : null}
                </span>
                <span className={`mt-2 text-mhl-fine ${now || done ? "font-bold text-mhl-ink" : "font-medium text-mhl-muted"}`}>
                  {t.label}
                </span>
                <span className="text-[0.7rem] text-mhl-faint">({t.range})</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
