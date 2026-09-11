import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useRecords } from "@/store/RecordsContext";
import { demoEmergencyToken } from "@/data/mock";
import { isCriticalAllergy } from "@/types/health";
import { formatRelative, formatShortDate, yearOf } from "@/lib/format";
import { Section } from "@/components/ui/Section";
import { Tag, allergyTone, appointmentTone } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonStyles } from "@/components/ui/Button";
import { EmergencyCard } from "@/components/emergency/EmergencyCard";
import {
  AllergyIcon,
  CalendarIcon,
  ChevronRightIcon,
  DocumentIcon,
  PlusIcon,
  ScanIcon,
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

export default function Dashboard() {
  const { user } = useAuth();
  const { profile, allergies, medications, appointments, documents } = useRecords();

  const firstName = (user?.name ?? profile.fullName).split(" ")[0];
  const critical = allergies.filter((a) => isCriticalAllergy(a.severity));
  const activeMeds = medications.filter((m) => m.active);

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
        <h1 className="text-mhl-answer font-bold text-mhl-ink">
          {timeGreeting()}, {firstName}
        </h1>
        <p className="mt-1 text-mhl-body text-mhl-muted">Here's where your health record stands today.</p>
      </header>

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
            These show on your emergency card.{" "}
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

      <EmergencyCard token={demoEmergencyToken} />

      <div className="flex flex-wrap gap-2">
        <Link to="/app/add" className={buttonStyles("primary", "md")}>
          <PlusIcon size={18} strokeWidth={2.25} />
          Add a record
        </Link>
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
              <Link to="/app/add" className={buttonStyles("primary", "md")}>
                <PlusIcon size={18} strokeWidth={2.25} />
                Add a record
              </Link>
            }
          />
        )}
      </Section>

      <p className="flex items-center justify-center gap-1 pt-1 text-mhl-fine text-mhl-faint">
        Your records are private to you
        <ChevronRightIcon size={14} />
      </p>
    </div>
  );
}
