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
import { Section } from "@/components/ui/Section";
import { buttonStyles } from "@/components/ui/Button";
import { Tag, appointmentTone } from "@/components/ui/Tag";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { CalendarIcon, EditIcon, PlusIcon, TrashIcon } from "@/components/icons";

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
      <li key={a.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
          <CalendarIcon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-mhl-body font-semibold text-mhl-ink">{a.title}</p>
            <Tag tone={appointmentTone(a.status)}>{APPOINTMENT_STATUS_LABELS[a.status]}</Tag>
          </div>
          <p className="mt-1 text-mhl-fine text-mhl-muted">{formatDateTime(a.scheduledFor)}</p>
          {meta.length > 0 && <p className="text-mhl-fine text-mhl-faint">{meta.join("  ·  ")}</p>}
        </div>
        <div className="flex flex-none items-center">
          {canEdit && (
            <>
              <IconButton
                label={`Edit ${a.title}`}
                onClick={() => {
                  setEdit({ record: a, draft: appointmentToDraft(a) });
                  setErrors({});
                }}
              >
                <EditIcon size={18} />
              </IconButton>
              <IconButton label={`Delete ${a.title}`} tone="danger" onClick={() => setDel(a)}>
                <TrashIcon size={18} />
              </IconButton>
            </>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Appointments"
        subtitle="Visits ahead and the ones already behind you."
        action={
          canEdit ? (
            <Link to="/app/add?type=visit" className={buttonStyles("primary", "md")}>
              <PlusIcon size={18} strokeWidth={2.25} />
              Add visit
            </Link>
          ) : undefined
        }
      />

      {appointments.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon size={28} />}
          title="No appointments yet"
          description="Add an upcoming visit so it's easy to keep track of, or log one that's already happened."
          action={
            canEdit ? (
              <Link to="/app/add?type=visit" className={buttonStyles("primary", "md")}>
                <PlusIcon size={18} strokeWidth={2.25} />
                Add a visit
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <Section question="What's coming up?">
            {upcoming.length > 0 ? (
              <ul className="mt-3 divide-y divide-mhl-rule">{upcoming.map(row)}</ul>
            ) : (
              <p className="mt-3 text-mhl-fine text-mhl-muted">Nothing scheduled right now.</p>
            )}
          </Section>

          {past.length > 0 && (
            <Section question="Earlier visits">
              <ul className="mt-3 divide-y divide-mhl-rule">{past.map(row)}</ul>
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
        onChange={(patch) => setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))}
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
