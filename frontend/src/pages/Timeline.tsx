import { useMemo, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { APPOINTMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS, formatVitalValue, vitalName } from "@/types/health";
import { formatDate, yearOf } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAppMode } from "@/store/AppModeContext";
import { ModeHint } from "@/components/modes/ModeHint";
import { Section } from "@/components/ui/Section";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AllergyIcon,
  CalendarIcon,
  ConditionIcon,
  DocumentIcon,
  PillIcon,
  PlusIcon,
  ScanIcon,
  TimelineIcon,
  VaccineIcon,
  VitalsIcon,
} from "@/components/icons";

type EventIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

interface TimelineEvent {
  key: string;
  date: string;
  Icon: EventIcon;
  title: string;
  meta?: string;
}

export default function Timeline() {
  const { canEdit } = useCareProxy();
  const { mode, criticalConditionId } = useAppMode();
  const { allergies, medications, conditions, appointments, documents, immunizations, procedures, vitals } =
    useRecords();
  const focusName = conditions.find((c) => c.id === criticalConditionId)?.name;

  const groups = useMemo<[string, TimelineEvent[]][]>(() => {
    const events: TimelineEvent[] = [];

    for (const a of allergies) {
      if (a.firstReactionDate)
        events.push({
          key: `al-${a.id}`,
          date: a.firstReactionDate,
          Icon: AllergyIcon,
          title: `First reaction to ${a.substance}`,
          meta: "Allergy",
        });
    }
    for (const m of medications) {
      if (m.startDate)
        events.push({
          key: `md-start-${m.id}`,
          date: m.startDate,
          Icon: PillIcon,
          title: `Started ${m.name}`,
          meta: [m.dosage, m.frequency].filter(Boolean).join(" · ") || "Medication",
        });
      if (m.endDate)
        events.push({
          key: `md-end-${m.id}`,
          date: m.endDate,
          Icon: PillIcon,
          title: `Stopped ${m.name}`,
          meta: "Medication",
        });
    }
    for (const c of conditions) {
      if (c.onsetDate)
        events.push({
          key: `cn-on-${c.id}`,
          date: c.onsetDate,
          Icon: ConditionIcon,
          title: `Diagnosed with ${c.name}`,
          meta: "Condition",
        });
      if (c.resolvedDate)
        events.push({
          key: `cn-res-${c.id}`,
          date: c.resolvedDate,
          Icon: ConditionIcon,
          title: `${c.name} resolved`,
          meta: "Condition",
        });
    }
    for (const a of appointments) {
      events.push({
        key: `ap-${a.id}`,
        date: a.scheduledFor,
        Icon: CalendarIcon,
        title: a.title,
        meta: [APPOINTMENT_STATUS_LABELS[a.status], a.facility].filter(Boolean).join(" · "),
      });
    }
    for (const d of documents) {
      events.push({
        key: `doc-${d.id}`,
        date: d.documentDate ?? d.uploadedAt,
        Icon: d.docType === "SCAN" ? ScanIcon : DocumentIcon,
        title: `Added ${d.title}`,
        meta: DOCUMENT_TYPE_LABELS[d.docType],
      });
    }
    for (const im of immunizations) {
      events.push({
        key: `im-${im.id}`,
        date: im.administeredOn,
        Icon: VaccineIcon,
        title: `Vaccinated: ${im.vaccine}`,
        meta: "Immunisation",
      });
    }
    for (const p of procedures) {
      events.push({
        key: `pr-${p.id}`,
        date: p.performedOn,
        Icon: ConditionIcon,
        title: p.name,
        meta: p.facility ?? "Procedure",
      });
    }
    for (const v of vitals) {
      events.push({
        key: `vt-${v.id}`,
        date: v.measuredAt,
        Icon: VitalsIcon,
        title: `${vitalName(v)} recorded`,
        meta: formatVitalValue(v),
      });
    }

    events.sort((a, b) => +new Date(b.date) - +new Date(a.date));

    const byYear = new Map<string, TimelineEvent[]>();
    for (const ev of events) {
      const y = yearOf(ev.date);
      const arr = byYear.get(y);
      if (arr) arr.push(ev);
      else byYear.set(y, [ev]);
    }
    return Array.from(byYear.entries());
  }, [allergies, medications, conditions, appointments, documents, immunizations, procedures, vitals]);

  return (
    <div>
      <PageHeader
        title={mode === "elderly" ? "My Records" : "Timeline"}
        subtitle={
          mode === "critical" && focusName
            ? `${focusName} first, then everything else — newest first.`
            : mode === "pregnancy"
              ? "Your pregnancy journey, newest first — the full record is here."
              : "Everything on your record, newest first."
        }
        action={
          canEdit ? (
            <Link to="/app/add" className={buttonStyles("primary", "md")}>
              <PlusIcon size={18} strokeWidth={2.5} />
              Add record
            </Link>
          ) : undefined
        }
      />
      <ModeHint page="timeline" />

      {groups.length === 0 ? (
        <EmptyState
          icon={<TimelineIcon size={28} />}
          title="Your timeline is empty"
          description="As you add records with dates, they'll line up here as a history you can scroll through."
          action={
            canEdit ? (
              <Link to="/app/add" className={buttonStyles("primary", "md")}>
                <PlusIcon size={18} strokeWidth={2.25} />
                Add a record
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Section
          icon={<TimelineIcon size={18} />}
          question="Everything on your record"
          lead="Grouped by year, newest first. Every record you keep is here."
        >
          {groups.map(([year, events], gi) => (
            <div key={year} className={cn(gi > 0 && "mt-5 border-t border-mhl-rule pt-5")}>
              <h3 className="mb-3 mt-2 text-[0.8rem] font-bold uppercase tracking-[0.1em] text-mhl-faint first:mt-2">
                {year}
              </h3>
              <ol className="relative">
                {events.map((ev, i) => {
                  const isLast = i === events.length - 1;
                  return (
                    <li key={ev.key} className="relative flex gap-3.5 pb-6 last:pb-0">
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-1 left-[21px] top-11 w-[1.5px] rounded-full bg-mhl-rule"
                        />
                      )}
                      <span className="relative grid h-11 w-11 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent ring-4 ring-mhl-surface">
                        <ev.Icon size={20} />
                      </span>
                      <div className="min-w-0 flex-1 pt-2">
                        <p className="text-[0.99rem] font-semibold text-mhl-ink">
                          {ev.title}
                        </p>
                        {ev.meta && (
                          <p className="mt-0.5 text-[0.845rem] text-mhl-muted">{ev.meta}</p>
                        )}
                        <p className="mt-0.5 text-[0.845rem] text-mhl-faint [font-variant-numeric:tabular-nums]">
                          {formatDate(ev.date)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
