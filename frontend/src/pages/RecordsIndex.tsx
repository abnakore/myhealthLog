/**
 * Every shelf of the record, in one plain list.
 *
 * Elderly mode's nav keeps four large doors, so this page is the one that holds the
 * rest: each collection by name, with a count, and one big tap to open it. It reads
 * the same record as every other page — nothing here is a separate copy or a
 * simplified view of the data, only a simpler way to reach it.
 */
import { Link } from "react-router-dom";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonStyles } from "@/components/ui/Button";
import {
  AllergyIcon,
  CalendarIcon,
  ChevronRightIcon,
  ConditionIcon,
  DocumentIcon,
  PillIcon,
  PlusIcon,
  RecordsIcon,
  StethoscopeIcon,
  TimelineIcon,
  VitalsIcon,
} from "@/components/icons";

interface Entry {
  to: string;
  label: string;
  hint: string;
  Icon: typeof PillIcon;
}

export default function RecordsIndex() {
  const { allergies, medications, conditions, vitals, appointments, documents } = useRecords();
  const { canEdit } = useCareProxy();
  const activeMeds = medications.filter((m) => m.active).length;

  const entries: Entry[] = [
    {
      to: "/app/allergies",
      label: "Allergies",
      hint: allergies.length === 1 ? "1 allergy" : `${allergies.length} allergies`,
      Icon: AllergyIcon,
    },
    {
      to: "/app/medications",
      label: "Medicines",
      hint:
        medications.length === 0
          ? "Nothing on file"
          : `${activeMeds} active of ${medications.length}`,
      Icon: PillIcon,
    },
    {
      to: "/app/conditions",
      label: "Conditions",
      hint:
        conditions.length === 1 ? "1 condition" : `${conditions.length} conditions`,
      Icon: ConditionIcon,
    },
    {
      to: "/app/measurements",
      label: "Measurements",
      hint: vitals.length === 1 ? "1 reading" : `${vitals.length} readings`,
      Icon: VitalsIcon,
    },
    {
      to: "/app/appointments",
      label: "Appointments",
      hint:
        appointments.length === 1 ? "1 visit" : `${appointments.length} visits`,
      Icon: CalendarIcon,
    },
    {
      to: "/app/documents",
      label: "Documents",
      hint: documents.length === 1 ? "1 document" : `${documents.length} documents`,
      Icon: DocumentIcon,
    },
    {
      to: "/app/summary",
      label: "Medical summary",
      hint: "The whole record on one page",
      Icon: StethoscopeIcon,
    },
    {
      to: "/app/timeline",
      label: "Full timeline",
      hint: "Everything, newest first",
      Icon: TimelineIcon,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="My records"
        subtitle="Everything on your health record, in one place."
        action={
          canEdit ? (
            <Link to="/app/add" className={buttonStyles("primary", "lg")}>
              <PlusIcon size={19} strokeWidth={2.5} />
              Add a record
            </Link>
          ) : undefined
        }
      />

      <div className="overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface shadow-mhl">
        <ul className="divide-y divide-mhl-rule">
          {entries.map(({ to, label, hint, Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="mhl-interactive flex min-h-[5rem] items-center gap-4 px-4 py-4 transition-colors hover:bg-mhl-sunk"
              >
                <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
                  <Icon size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-mhl-lead font-bold text-mhl-ink">
                    {label}
                  </span>
                  <span className="mt-0.5 block truncate text-mhl-body text-mhl-muted">
                    {hint}
                  </span>
                </span>
                <span className="flex-none text-mhl-faint">
                  <ChevronRightIcon size={22} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <p className="flex items-center gap-2 px-1 text-mhl-fine text-mhl-muted">
        <span className="flex-none text-mhl-accent/80">
          <RecordsIcon size={17} />
        </span>
        Tap any part of your record to see it or change it.
      </p>
    </div>
  );
}
