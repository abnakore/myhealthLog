/**
 * Elderly mode dashboard — the simplified home screen.
 *
 * Mirrors the elderly reference: the mode banner with a one-tap way to change
 * mode, four large fact cards, then medication reminders leading the left
 * column (the most prominent feature in this mode), conditions and visits
 * beneath; the emergency card, care proxy and quiet "what else" doors on the
 * right. Bigger touch targets throughout — legibility is the product here.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Appointment, Condition, Medication } from "@/types/health";
import { formatTime } from "@/lib/format";
import { Tag } from "@/components/ui/Tag";
import { ModeSwitchModal } from "@/components/profile/ModeSwitchModal";
import { EmergencyCard } from "@/components/emergency/EmergencyCard";
import { MedScheduleCard } from "@/components/modes/MedScheduleCard";
import {
  ActivityCard,
  CardOut,
  Disc,
  ProxyAccessCard,
  StripCell,
  type ActivityItem,
} from "./parts";
import {
  CalendarIcon,
  ChevronRightIcon,
  DropIcon,
  HeartIcon,
  HeartPulseIcon,
  LeafIcon,
  PillIcon,
  UsersIcon,
} from "@/components/icons";

export interface ElderlyDashProps {
  bloodType?: string;
  genotype?: string;
  activeMeds: Medication[];
  conditions: Condition[];
  appointments: Appointment[];
  trustedContacts: string[];
  canEdit: boolean;
  activity: ActivityItem[];
}

/** One upcoming visit, with the big date box the elderly reference leads with. */
function VisitRow({ visit }: { visit: Appointment }) {
  const d = new Date(visit.scheduledFor);
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  return (
    <Link
      to="/app/appointments"
      className="mhl-interactive mhl-row mt-3 flex min-w-0 items-center gap-3.5 rounded-mhl-sm bg-mhl-sunk px-3.5 py-3.5"
    >
      <span className="grid h-14 w-14 flex-none place-items-center rounded-mhl-sm bg-mhl-surface text-center shadow-mhl">
        <span className="text-[1.25rem] font-bold leading-none text-mhl-ink [font-variant-numeric:tabular-nums]">
          {day}
        </span>
        <span className="mt-0.5 text-[0.7rem] font-semibold leading-none text-mhl-muted">{month}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-mhl-body font-bold text-mhl-ink">{visit.title}</span>
        {visit.facility && <span className="block truncate text-mhl-fine text-mhl-muted">{visit.facility}</span>}
      </span>
      <span className="flex-none text-mhl-fine font-bold text-mhl-accent [font-variant-numeric:tabular-nums]">
        {formatTime(visit.scheduledFor)}
      </span>
      <span className="flex-none text-mhl-faint">
        <ChevronRightIcon size={18} />
      </span>
    </Link>
  );
}

export function ElderlyDash({
  bloodType,
  genotype,
  activeMeds,
  conditions,
  appointments,
  trustedContacts,
  canEdit,
  activity,
}: ElderlyDashProps) {
  const [switchOpen, setSwitchOpen] = useState(false);
  const activeConditions = conditions.filter((c) => c.status === "ACTIVE");
  const shownConditions = activeConditions.length > 0 ? activeConditions : conditions;
  const now = Date.now();
  const upcoming = [...appointments]
    .filter((a) => a.status === "SCHEDULED" && +new Date(a.scheduledFor) >= now)
    .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor));

  return (
    <>
      {/* The mode banner — what's on, and the one tap that changes it. */}
      <section
        aria-label="Elderly care mode is active"
        className="mhl-mode-hero flex min-w-0 flex-col gap-4 rounded-mhl border border-mhl-accent/25 bg-mhl-accent-lo/70 px-5 py-5 sm:flex-row sm:items-center sm:gap-5"
      >
        <span className="grid h-14 w-14 flex-none place-items-center rounded-full bg-mhl-accent text-white">
          <HeartIcon size={26} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-mhl-title font-bold tracking-[-0.02em] text-mhl-ink">
            Elderly care mode is active
          </h2>
          <p className="mt-1 text-mhl-body text-mhl-muted [text-wrap:pretty]">
            A simpler view with your important health information, medications, appointments and care
            support.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSwitchOpen(true)}
          className="mhl-interactive inline-flex min-h-12 flex-none items-center justify-center gap-2 rounded-full bg-mhl-surface px-5 py-3 text-mhl-body font-bold text-mhl-accent shadow-mhl hover:bg-mhl-sunk"
        >
          Change mode
          <ChevronRightIcon size={17} />
        </button>
      </section>

      {/* Four facts, four cards — each one a door into the page behind it. */}
      {/* `overflow-hidden` matters here: the cell inside paints its own surface, and
          without clipping it squares off the card's rounded corners. */}
      <section aria-label="Your health at a glance" className="grid min-w-0 grid-cols-2 gap-3.5 min-[560px]:grid-cols-4">
        <Link to="/app/profile" className="mhl-cardlink min-w-0 overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface shadow-mhl">
          <StripCell
            icon={<DropIcon size={20} />}
            label="Blood type"
            value={bloodType ?? "Not recorded"}
            sub={genotype ? `Genotype ${genotype}` : "Genotype not recorded"}
          />
        </Link>
        <Link to="/app/conditions" className="mhl-cardlink min-w-0 overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface shadow-mhl">
          <StripCell
            icon={<HeartPulseIcon size={20} />}
            label="Active conditions"
            value={shownConditions.length}
            sub={<span className="font-semibold text-mhl-accent">View details</span>}
          />
        </Link>
        <Link to="/app/medications" className="mhl-cardlink min-w-0 overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface shadow-mhl">
          <StripCell
            icon={<PillIcon size={20} />}
            label="Medications"
            value={activeMeds.length}
            sub="Active"
          />
        </Link>
        <Link to="/app/proxy" className="mhl-cardlink min-w-0 overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface shadow-mhl">
          <StripCell
            icon={<UsersIcon size={20} />}
            label="Care proxy"
            value={trustedContacts.length}
            sub={trustedContacts.length === 1 ? "trusted contact" : "trusted contacts"}
          />
        </Link>
      </section>

      <div className="mhl-dash__cols">
        <div className="mhl-dash__left flex min-w-0 flex-col gap-5">
          {/* Medication reminders lead this mode — the doses a carer helps with. */}
          <MedScheduleCard meds={activeMeds} large />

          {/* The conditions on file, in their own words. */}
          <section
            aria-labelledby="elderly-conditions-title"
            className="min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl"
          >
            <div className="flex items-center gap-2.5">
              <Disc size={32}>
                <HeartPulseIcon size={16} />
              </Disc>
              <h2
                id="elderly-conditions-title"
                className="min-w-0 flex-1 text-mhl-card font-bold tracking-[-0.015em] text-mhl-ink"
              >
                Active conditions
              </h2>
              <span className="flex-none text-mhl-fine text-mhl-muted">
                {shownConditions.length} {shownConditions.length === 1 ? "condition" : "conditions"}
              </span>
              <CardOut to="/app/conditions">View details</CardOut>
            </div>
            {shownConditions.length > 0 ? (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {shownConditions.map((c) => (
                  <Link key={c.id} to="/app/conditions" className="mhl-chip">
                    <Tag tone="watch">{c.name}</Tag>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-mhl-fine text-mhl-muted">
                No conditions on file yet.{" "}
                {canEdit && (
                  <Link to="/app/add" className="font-semibold text-mhl-accent">
                    Add one
                  </Link>
                )}
              </p>
            )}
          </section>

          {/* Upcoming appointments — the date box leads, the time closes. */}
          <section
            aria-labelledby="elderly-upcoming-title"
            className="min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl"
          >
            <div className="flex items-center gap-2.5">
              <Disc size={32}>
                <CalendarIcon size={16} />
              </Disc>
              <h2
                id="elderly-upcoming-title"
                className="min-w-0 flex-1 text-mhl-card font-bold tracking-[-0.015em] text-mhl-ink"
              >
                Upcoming appointments
              </h2>
              <CardOut to="/app/appointments">View all</CardOut>
            </div>
            {upcoming.length > 0 ? (
              upcoming.slice(0, 3).map((v) => <VisitRow key={v.id} visit={v} />)
            ) : (
              <p className="mt-3 text-mhl-fine text-mhl-muted">
                No visits booked yet.{" "}
                <Link to="/app/appointments" className="font-semibold text-mhl-accent">
                  Book one
                </Link>
              </p>
            )}
          </section>

          <ActivityCard items={activity} />
        </div>

        {/* The right column: the card of record, who can help, and quiet doors. */}
        <div className="mhl-dash__right flex min-w-0 flex-col gap-3.5">
          <EmergencyCard />

          <ProxyAccessCard
            contacts={trustedContacts}
            description="Give trusted family or friends limited access to your health information."
          />

          <section
            aria-labelledby="elderly-else-title"
            className="min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl"
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
              <LeafIcon size={20} />
            </span>
            <h2 id="elderly-else-title" className="mt-3 text-mhl-card font-bold text-mhl-ink">
              What else would you like to do today?
            </h2>
            <p className="mt-1 text-mhl-fine text-mhl-muted [text-wrap:pretty]">
              View your full timeline, add a record or explore your health summary.
            </p>
            <Link
              to="/app/records"
              className="mhl-interactive mt-4 flex min-h-12 items-center justify-center gap-2 rounded-full bg-mhl-accent px-5 py-3 text-mhl-body font-bold text-white hover:bg-mhl-accent-strong"
            >
              View all my records
              <ChevronRightIcon size={17} />
            </Link>
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
              {canEdit && (
                <Link to="/app/add" className="text-mhl-fine font-semibold text-mhl-accent hover:underline">
                  Add a record
                </Link>
              )}
              <Link to="/app/summary" className="text-mhl-fine font-semibold text-mhl-accent hover:underline">
                Health summary
              </Link>
            </div>
          </section>
        </div>
      </div>

      <ModeSwitchModal open={switchOpen} onClose={() => setSwitchOpen(false)} />
    </>
  );
}
