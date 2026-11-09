/**
 * Shared dashboard building blocks — the card vocabulary every mode's home
 * screen speaks: the coral disc, the card head with one link out, the summary
 * strip cell, the reading row's worded status cue, and the activity / upcoming
 * / proxy cards reused across the four dashboards.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import {
  APPOINTMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  formatVitalValue,
  vitalStatus,
  vitalName,
  type Appointment,
  type HealthDocument,
  type VitalReading,
} from "@/types/health";
import { formatDate, formatTime } from "@/lib/format";
import { Tag, appointmentTone, type TagTone } from "@/components/ui/Tag";
import { Sparkline } from "@/components/ui/Sparkline";
import { ChevronRightIcon, CalendarIcon, DocumentIcon, ScanIcon, UsersIcon, VitalsIcon, HeartIcon, DropIcon, WeightIcon } from "@/components/icons";

/** The tinted disc that carries a card head's icon — 32px in a head, 44px in a row. */
export function Disc({ size = 32, children, className }: { size?: number; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn("grid flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent", className)}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}

/** A card head: disc, plain title, one link out. */
export function CardHead({
  icon,
  title,
  titleId,
  action,
  sub,
}: {
  icon: ReactNode;
  title: string;
  titleId?: string;
  action?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Disc size={32}>{icon}</Disc>
      <div className="min-w-0 flex-1">
        <h2
          id={titleId}
          className="min-w-0 truncate text-mhl-card font-bold tracking-[-0.015em] text-mhl-ink"
        >
          {title}
        </h2>
        {sub && <p className="mt-0.5 truncate text-mhl-fine text-mhl-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** The quiet "View all" link that ends a card head. */
export function CardOut({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "mhl-cardlink flex-none whitespace-nowrap rounded-full px-1 text-[0.845rem] font-semibold text-mhl-accent transition-colors hover:text-mhl-accent-strong",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** The gentle in/out-of-range cue on a reading — always beside the number, never
    alone. Worded (Normal / Low / High) so it survives a glance. */
export function NumberStatus({
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
export function VitalIcon({ reading, size = 21 }: { reading: VitalReading; size?: number }) {
  if (reading.vitalType === "BLOOD_PRESSURE") return <HeartIcon size={size} />;
  if (reading.vitalType === "BLOOD_GLUCOSE") return <DropIcon size={size} />;
  if (reading.vitalType === "WEIGHT") return <WeightIcon size={size} />;
  return <VitalsIcon size={size} />;
}

/** One fact in a summary strip — a pointer into the page behind it. */
export function StripCell({
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

/* ------------------------------------------------------------ activity -- */

export interface ActivityItem {
  id: string;
  to: string;
  icon: typeof DocumentIcon;
  label: string;
  kind: string;
  when: string;
}

/** What changed, in the order it changed — documents and attended visits, the
    record's own audit trail (the data model has no invented events). */
export function buildActivity(
  documents: HealthDocument[],
  appointments: Appointment[],
  limit = 4,
): ActivityItem[] {
  const docs: ActivityItem[] = documents.map((d) => ({
    id: d.id,
    to: `/app/records/documents/${d.id}`,
    icon: d.docType === "SCAN" ? ScanIcon : DocumentIcon,
    label: d.title,
    kind: d.docType === "SCAN" ? "Scan" : (DOCUMENT_TYPE_LABELS[d.docType] ?? "Document"),
    when: d.uploadedAt,
  }));
  const visits: ActivityItem[] = appointments
    .filter((a) => a.status === "ATTENDED")
    .map((a) => ({
      id: a.id,
      to: "/app/appointments",
      icon: CalendarIcon,
      label: a.title,
      kind: "Visit attended",
      when: a.scheduledFor,
    }));
  return [...docs, ...visits]
    .sort((a, b) => +new Date(b.when) - +new Date(a.when))
    .slice(0, limit);
}

/** The recent-activity card: one row per event, chevron out. */
export function ActivityCard({
  items,
  title = "Recent activity",
  className,
}: {
  items: ActivityItem[];
  title?: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="activity-title"
      className={cn(
        "mhl-dash__act min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-1 pt-5 shadow-mhl",
        className,
      )}
    >
      <CardHead
        icon={<CalendarIcon size={16} />}
        title={title}
        titleId="activity-title"
        action={<CardOut to="/app/timeline">View all</CardOut>}
      />
      {items.length > 0 ? (
        <ul className="mt-2">
          {items.map((item) => {
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
                    <p className="truncate text-[0.99rem] font-semibold text-mhl-ink">{item.label}</p>
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
        <p className="mt-3 mb-4 text-mhl-fine text-mhl-muted">
          Records you add will show up here as recent activity.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ upcoming -- */

/** The upcoming-visits card — the next visit (or the next few) with a chevron. */
export function UpcomingCard({
  visits,
  title = "What's coming up?",
  empty,
  rescheduleHint = false,
  className,
}: {
  visits: Appointment[];
  title?: string;
  empty?: ReactNode;
  /** A quiet "manage them from the timeline" row under the list. */
  rescheduleHint?: boolean;
  className?: string;
}) {
  const next = visits[0];
  return (
    <section
      aria-labelledby="upcoming-title"
      className={cn(
        "mhl-dash__upcoming min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl",
        className,
      )}
    >
      <CardHead
        icon={<CalendarIcon size={16} />}
        title={title}
        titleId="upcoming-title"
        action={<CardOut to="/app/appointments">View all</CardOut>}
      />
      {next ? (
        <ul className="mt-3 space-y-2">
          {visits.slice(0, 3).map((v, i) => (
            <li key={v.id}>
              <Link
                to="/app/appointments"
                className="mhl-interactive mhl-row flex min-w-0 items-center gap-3 rounded-mhl-sm bg-mhl-sunk px-3.5 py-3"
              >
                <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-mhl-surface text-mhl-accent shadow-mhl">
                  <CalendarIcon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.99rem] font-semibold text-mhl-ink">{v.title}</span>
                  <span className="block truncate text-[0.845rem] text-mhl-muted [font-variant-numeric:tabular-nums]">
                    {formatDate(v.scheduledFor)}
                    {i === 0 && ` · ${formatTime(v.scheduledFor)}`}
                    {v.facility ? ` · ${v.facility}` : ""}
                  </span>
                </span>
                {i === 0 && (
                  <Tag tone={appointmentTone(v.status)} className="hidden flex-none sm:inline-flex">
                    {APPOINTMENT_STATUS_LABELS[v.status]}
                  </Tag>
                )}
                <span className="flex-none text-mhl-faint">
                  <ChevronRightIcon size={16} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-mhl-fine text-mhl-muted">
          {empty ?? (
            <>
              No visits booked yet.{" "}
              <Link to="/app/appointments" className="font-semibold text-mhl-accent hover:text-mhl-accent-strong">
                Book one
              </Link>
            </>
          )}
        </p>
      )}
      {rescheduleHint && (
        <Link
          to="/app/timeline"
          className="mhl-interactive mhl-row mt-2 flex min-w-0 items-center gap-3 rounded-mhl-sm px-3.5 py-3"
        >
          <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
            <CalendarIcon size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.99rem] font-semibold text-mhl-ink">Need to reschedule?</span>
            <span className="block truncate text-[0.845rem] text-mhl-muted">
              You can manage your appointments from the timeline.
            </span>
          </span>
          <span className="flex-none text-mhl-faint">
            <ChevronRightIcon size={16} />
          </span>
        </Link>
      )}
    </section>
  );
}

/* --------------------------------------------------------- care proxy -- */

/** The care-proxy access card: the offer, and the one trusted contact. */
export function ProxyAccessCard({
  contacts,
  className,
  description = "Give trusted family or friends limited access to your health information.",
}: {
  contacts: string[];
  className?: string;
  description?: string;
}) {
  return (
    <section
      aria-labelledby="proxy-title"
      className={cn(
        "min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Disc size={28}>
          <UsersIcon size={15} />
        </Disc>
        <h2 id="proxy-title" className="min-w-0 flex-1 text-[0.9rem] font-bold tracking-[-0.012em] text-mhl-ink">
          Care proxy access
        </h2>
        <CardOut to="/app/proxy" className="whitespace-nowrap text-[0.74rem]">
          Manage
        </CardOut>
      </div>
      <p className="mt-2 text-[0.845rem] leading-snug text-mhl-muted [text-wrap:pretty]">{description}</p>
      <Link
        to="/app/proxy"
        className="mhl-interactive mhl-row mt-3.5 flex min-w-0 items-center gap-2.5 rounded-mhl-sm bg-mhl-sunk px-3 py-2.5"
      >
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-mhl-surface text-mhl-muted shadow-mhl">
          <UsersIcon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8rem] text-mhl-muted">
            {contacts.length === 1 ? "1 trusted contact" : `${contacts.length} trusted contacts`}
          </span>
          <span className="block truncate text-[0.9rem] font-semibold text-mhl-ink">
            {contacts.length > 0 ? contacts[0] : "No one yet"}
          </span>
        </span>
        <span className="flex-none text-mhl-faint">
          <ChevronRightIcon size={16} />
        </span>
      </Link>
    </section>
  );
}

/* ------------------------------------------------------------- readings -- */

/** One row in a measurements card: disc, name + date, the number (tabular),
    the worded cue, and the shape of the last readings. */
export function ReadingRow({
  latest,
  values,
  compact = false,
}: {
  latest: VitalReading;
  values: number[];
  compact?: boolean;
}) {
  const unit = latest.unit || "";
  const full = formatVitalValue(latest);
  const figure = unit && full.endsWith(` ${unit}`) ? full.slice(0, -(unit.length + 1)) : full;
  return (
    <div className="flex min-w-0 items-center gap-3.5 border-t border-mhl-rule py-4 first:border-t-0">
      <Disc size={compact ? 38 : 44}>
        <VitalIcon reading={latest} size={compact ? 18 : 21} />
      </Disc>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.99rem] font-semibold text-mhl-ink">{vitalName(latest)}</p>
        <p className="truncate text-[0.845rem] text-mhl-muted">{formatDate(latest.measuredAt)}</p>
      </div>
      <p className="flex flex-none items-baseline gap-[0.18rem] whitespace-nowrap text-[1.06rem] font-bold tracking-[-0.01em] text-mhl-ink [font-variant-numeric:tabular-nums]">
        <span>{figure}</span>
        {unit && <span className="text-[0.7em] font-semibold text-mhl-muted">{unit}</span>}
      </p>
      <span className="hidden flex-none sm:block">
        <NumberStatus reading={latest} values={values} />
      </span>
      {values.length > 1 && (
        <span className="hidden w-[4.5rem] flex-none sm:block">
          <ReadingSpark latest={latest} values={values} />
        </span>
      )}
    </div>
  );
}

/** The sparkline behind a reading — green for in-range measures, blue for body
    metrics that have no band. */
export function ReadingSpark({
  latest,
  values,
  className,
}: {
  latest: VitalReading;
  values: number[];
  className?: string;
}) {
  return (
    <Sparkline
      values={values}
      width={78}
      height={34}
      strokeWidth={1.8}
      className={cn(
        "block h-10 w-full",
        className ?? (latest.vitalType === "WEIGHT" ? "text-mhl-info" : "text-mhl-good"),
      )}
    />
  );
}
