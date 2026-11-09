/**
 * Medication reminders — the prominent schedule card. In Elderly mode this is
 * the most important card on the home screen: each dose carries a time-of-day
 * mark (sun for morning, moon for evening) beside the plain instructions, and
 * the whole row is one large tap target, per the reference.
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import type { Medication } from "@/types/health";
import { PillIcon, SunIcon, MoonIcon, ChevronRightIcon } from "@/components/icons";

function doseLine(m: Medication): string {
  return [m.dosage, m.frequency].filter(Boolean).join(" · ") || "As directed";
}

function timeHint(m: Medication): string {
  const f = (m.frequency ?? "").toLowerCase();
  if (f.includes("morning") || f.includes("breakfast")) return "8:00 AM";
  if (f.includes("dinner") || f.includes("night")) return "8:00 PM";
  if (f.includes("twice")) return "8:00 AM · 8:00 PM";
  if (f.includes("noon") || f.includes("lunch")) return "1:00 PM";
  return "Daily";
}

/** Morning doses wear the sun, evening doses the moon, anything else the pill. */
function DoseIcon({ med, size }: { med: Medication; size: number }) {
  const f = `${med.frequency ?? ""} ${timeHint(med)}`.toLowerCase();
  if (f.includes("morning") || f.includes("breakfast") || f.includes("am") || f.includes("noon") || f.includes("lunch"))
    return <SunIcon size={size} />;
  if (f.includes("dinner") || f.includes("night") || f.includes("pm")) return <MoonIcon size={size} />;
  return <PillIcon size={size} />;
}

export function MedScheduleCard({ meds, large = false }: { meds: Medication[]; large?: boolean }) {
  return (
    <section
      aria-labelledby="med-sched-title"
      className="mhl-lift min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-[1.15rem] pb-5 pt-[1.1rem] shadow-mhl"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
          <PillIcon size={16} />
        </span>
        <div className="min-w-0 flex-1 basis-24">
          <h2 id="med-sched-title" className="truncate text-mhl-lead font-bold text-mhl-ink">
            {large ? "Medication reminders" : "What do I take?"}
          </h2>
          {large && (
            <p className="mt-0.5 truncate text-mhl-fine text-mhl-muted">
              Your next doses and daily schedule
            </p>
          )}
        </div>
        <Link
          to="/app/medications"
          className="mhl-cardlink flex-none whitespace-nowrap text-mhl-fine font-semibold text-mhl-accent"
        >
          {large ? "View all" : "All medicines"}
        </Link>
      </div>
      {meds.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {meds.map((m) => (
            <li key={m.id}>
              <Link
                to="/app/medications"
                className={cn(
                  "mhl-interactive mhl-row flex min-w-0 items-center gap-3 rounded-mhl-sm bg-mhl-sunk",
                  large ? "px-4 py-4" : "px-3.5 py-3",
                )}
              >
                <span
                  className={cn(
                    "grid flex-none place-items-center rounded-full bg-mhl-surface text-mhl-accent shadow-mhl",
                    large ? "h-12 w-12" : "h-10 w-10",
                  )}
                >
                  <DoseIcon med={m} size={large ? 22 : 19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-bold text-mhl-ink", large ? "text-mhl-lead" : "text-mhl-body")}>
                    {m.name} {m.dosage ? <span className="font-semibold text-mhl-muted">{m.dosage}</span> : null}
                  </span>
                  <span className={cn("block truncate text-mhl-muted", large ? "text-mhl-body" : "text-mhl-fine")}>
                    {doseLine(m)}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex-none rounded-full bg-mhl-surface font-bold text-mhl-accent",
                    large ? "px-4 py-2.5 text-mhl-body" : "px-3 py-1.5 text-mhl-fine",
                  )}
                >
                  {timeHint(m)}
                </span>
                {large && (
                  <span className="flex-none text-mhl-faint">
                    <ChevronRightIcon size={18} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-mhl-fine text-mhl-muted">No active medicines on file.</p>
      )}
      {large && meds.length > 0 && (
        <Link
          to="/app/medications"
          className="mhl-interactive mt-3.5 flex items-center justify-center gap-2 rounded-mhl-sm bg-mhl-accent px-4 py-3.5 text-mhl-body font-bold text-white hover:bg-mhl-accent-strong"
        >
          View full medication schedule
        </Link>
      )}
    </section>
  );
}
