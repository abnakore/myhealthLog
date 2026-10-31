import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { APPOINTMENT_STATUS_LABELS, type Appointment } from "@/types/health";
import { formatDateTime } from "@/lib/format";
import {
  appointmentToDraft,
  validateAppointment,
  appointmentFromDraft,
  type AppointmentDraft,
  type FieldErrors,
} from "@/components/records/model";
import { AppointmentFields } from "@/components/records/FieldSets";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModeHint } from "@/components/modes/ModeHint";
import { Section } from "@/components/ui/Section";
import { buttonStyles } from "@/components/ui/Button";
import { Tag, appointmentTone } from "@/components/ui/Tag";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import {
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";

export default function Appointments() {
  const { canEdit } = useCareProxy();
  const { appointments, updateItem, removeItem } = useRecords();
  const [edit, setEdit] = useState<{ record: Appointment; draft: AppointmentDraft } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [del, setDel] = useState<Appointment | null>(null);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const isUpcoming = (a: Appointment) =>
      a.status === "SCHEDULED" && +new Date(a.scheduledFor) >= now;
    const up = appointments
      .filter(isUpcoming)
      .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor));
    const rest = appointments
      .filter((a) => !isUpcoming(a))
      .sort((a, b) => +new Date(b.scheduledFor) - +new Date(a.scheduledFor));
    return { upcoming: up, past: rest };
  }, [appointments]);

  function save() {
    if (!edit) return;
    const errs = validateAppointment(edit.draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    updateItem("appointments", edit.record.id, appointmentFromDraft(edit.draft, edit.record));
    setEdit(null);
  }

  function row(a: Appointment): ReactNode {
    const meta = [a.clinician, a.facility].filter(Boolean);
    return (
      <li key={a.id} className="group/row border-t border-mhl-rule first:border-t-0">
        <div className="flex min-w-0 items-center gap-2 py-3.5">
          <Link
            to={`/app/records/appointments/${a.id}`}
            className="group flex min-w-0 flex-1 items-center gap-3.5 rounded-mhl-sm"
          >
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
              <CalendarIcon size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[0.99rem] font-semibold text-mhl-ink">{a.title}</span>
                <Tag tone={appointmentTone(a.status)}>{APPOINTMENT_STATUS_LABELS[a.status]}</Tag>
              </span>
              <span className="mt-0.5 block truncate text-[0.845rem] text-mhl-muted [font-variant-numeric:tabular-nums]">
                {formatDateTime(a.scheduledFor)}
              </span>
              {meta.length > 0 && (
                <span className="mt-0.5 block truncate text-[0.845rem] text-mhl-faint">
                  {meta.join(" · ")}
                </span>
              )}
            </span>
            <span className="flex-none text-mhl-faint transition-colors group-hover:text-mhl-accent">
              <ChevronRightIcon size={17} />
            </span>
          </Link>
          <div className="flex flex-none items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
            {canEdit && (
              <>
                <IconButton
                  label={`Edit ${a.title}`}
                  onClick={() => {
                    setEdit({ record: a, draft: appointmentToDraft(a) });
                    setErrors({});
                  }}
                >
                  <EditIcon size={17} />
                </IconButton>
                <IconButton
                  label={`Delete ${a.title}`}
                  tone="danger"
                  onClick={() => setDel(a)}
                >
                  <TrashIcon size={17} />
                </IconButton>
              </>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Appointments"
        subtitle={
          appointments.length === 0
            ? "Visits ahead and the ones already behind you."
            : upcoming.length > 0
              ? `${upcoming.length} ahead · ${past.length} already behind you`
              : `Nothing ahead right now · ${past.length} already behind you`
        }
        action={
          canEdit ? (
            <Link to="/app/add?type=visit" className={buttonStyles("primary", "md")}>
              <PlusIcon size={18} strokeWidth={2.5} />
              Add visit
            </Link>
          ) : undefined
        }
      />
      <ModeHint page="appointments" />

      {appointments.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon size={22} />}
          title="No appointments yet"
          description="Add an upcoming visit so it's easy to keep track of, or log one that's already happened."
          action={
            canEdit ? (
              <Link to="/app/add?type=visit" className={buttonStyles("primary", "md")}>
                <PlusIcon size={18} strokeWidth={2.5} />
                Add a visit
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <Section
            icon={<CalendarIcon size={18} />}
            question="What's coming up?"
            lead="The next visits on your record, soonest first."
            action={
              upcoming.length > 0 ? (
                <Link
                  to="/app/add?type=visit"
                  className="text-[0.845rem] font-semibold text-mhl-accent hover:text-mhl-accent-strong"
                >
                  Add visit
                </Link>
              ) : undefined
            }
          >
            {upcoming.length > 0 ? (
              <ul className="mt-3">{upcoming.map(row)}</ul>
            ) : (
              <p className="mt-3 rounded-mhl-sm bg-mhl-sunk px-4 py-3.5 text-mhl-fine text-mhl-muted">
                Nothing scheduled right now. Add a visit and it will show here and on your
                dashboard.
              </p>
            )}
          </Section>

          {past.length > 0 && (
            <Section
              icon={<ClockIcon size={18} />}
              question="Earlier visits"
              lead="What has already happened, newest first."
            >
              <ul className="mt-3">{past.map(row)}</ul>
            </Section>
          )}
        </>
      )}

      <RecordEditModal<AppointmentDraft>
        open={edit !== null}
        title="Edit visit"
        draft={edit?.draft ?? null}
        errors={errors}
        Fields={AppointmentFields}
        onChange={(patch) =>
          setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))
        }
        onSave={save}
        onClose={() => setEdit(null)}
      />

      <ConfirmDialog
        open={del !== null}
        title="Delete this visit?"
        message={del ? `${del.title} will be removed from your record.` : ""}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (del) removeItem("appointments", del.id);
        }}
        onClose={() => setDel(null)}
      />
    </div>
  );
}
