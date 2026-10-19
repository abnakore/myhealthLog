/**
 * Critical hero — mirrors the critical preview: condition headline,
 * stable narrative, status/meds/readings/follow-up tiles, next visit row.
 */
import { Link } from "react-router-dom";
import type { Appointment, Condition, Medication, VitalReading } from "@/types/health";
import { formatDate, formatShortDate, formatTime } from "@/lib/format";
import { Tag, appointmentTone } from "@/components/ui/Tag";
import { HeroEyebrow, HeroShell, PortraitArt } from "./ModeHeroShell";
import { CalendarIcon, ConditionIcon } from "@/components/icons";

export function CriticalHero({
  condition,
  meds,
  vitals,
  nextVisit,
  onChangeFocus,
}: {
  condition: Condition;
  meds: Medication[];
  vitals: VitalReading[];
  nextVisit?: Appointment;
  onChangeFocus: () => void;
}) {
  const activeMeds = meds.filter((m) => m.active);
  return (
    <HeroShell
      eyebrow={`${condition.name} — active condition`}
      art={
        <PortraitArt
          variant="critical"
          headline="Better care. More control. Always."
          sub={`${condition.name} · in focus`}
        />
      }
    >
      <HeroEyebrow icon={<ConditionIcon size={15} />} text={`${condition.name} · active condition`} />
      <h2 className="mt-2 text-mhl-answer font-bold tracking-[-0.02em] text-mhl-ink">{condition.name}</h2>
      <p className="mt-1 text-mhl-fine text-mhl-muted">
        {condition.notes ? `${condition.notes.split(".")[0].trim().slice(0, 120)}.` : "Your condition is currently stable."}{" "}
        Keep up with your medications and avoid known triggers.
      </p>
      <button
        type="button"
        onClick={onChangeFocus}
        className="mt-2 text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
      >
        Change focused condition
      </button>
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-mhl-sm bg-mhl-sunk p-3.5">
          <p className="text-mhl-fine text-mhl-muted">Current status</p>
          <p className="mt-0.5 text-mhl-body font-bold text-mhl-good">Stable</p>
          <p className="text-[0.72rem] text-mhl-faint">No recent flare-ups</p>
        </div>
        <div className="rounded-mhl-sm bg-mhl-sunk p-3.5">
          <p className="text-mhl-fine text-mhl-muted">Active medicines</p>
          <p className="mt-0.5 text-mhl-body font-bold text-mhl-ink">{activeMeds.length}</p>
          <p className="truncate text-[0.72rem] text-mhl-faint">
            {activeMeds.slice(0, 2).map((m) => m.name).join(", ") || "None active"}
          </p>
        </div>
        <div className="rounded-mhl-sm bg-mhl-sunk p-3.5">
          <p className="text-mhl-fine text-mhl-muted">Readings logged</p>
          <p className="mt-0.5 text-mhl-body font-bold text-mhl-ink">{vitals.length}</p>
          <p className="text-[0.72rem] text-mhl-faint">Last 30 days</p>
        </div>
        <div className="rounded-mhl-sm bg-mhl-sunk p-3.5">
          <p className="text-mhl-fine text-mhl-muted">Next follow-up</p>
          <p className="mt-0.5 truncate text-mhl-body font-bold text-mhl-ink">
            {nextVisit ? formatShortDate(nextVisit.scheduledFor) : "—"}
          </p>
          <p className="truncate text-[0.72rem] text-mhl-faint">
            {nextVisit?.facility ?? "Not booked yet"}
          </p>
        </div>
      </div>
      {nextVisit && (
        <Link
          to="/app/appointments"
          className="mhl-row mt-3 flex items-center gap-2.5 rounded-mhl-sm bg-mhl-sunk px-3.5 py-3"
        >
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-mhl-surface text-mhl-accent">
            <CalendarIcon size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-mhl-body font-semibold text-mhl-ink">{nextVisit.title}</span>
            <span className="block truncate text-mhl-fine text-mhl-muted">
              {formatDate(nextVisit.scheduledFor)} · {formatTime(nextVisit.scheduledFor)}
              {nextVisit.facility ? ` · ${nextVisit.facility}` : ""}
            </span>
          </span>
          <Tag tone={appointmentTone(nextVisit.status)}>
            {nextVisit.status === "SCHEDULED" ? "Scheduled" : nextVisit.status}
          </Tag>
        </Link>
      )}
    </HeroShell>
  );
}
