/**
 * The pregnancy context's own facts — the small set of things a generic health record
 * genuinely can't hold: how it's going, the dates, and the obstetric history.
 *
 * Everything else about a pregnancy is an existing record and stays one. There is no
 * "pregnancy medication" here and no "pregnancy lab" — just dates, so the profile can
 * say how far along it is and what is due when.
 *
 * The form is the only place these dates are collected, so it does three things:
 * opens on what's already on file (never a blank copy), checks the dates against each
 * other before saving, and shows what they'll read as — "24 weeks 3 days, due 12 Jan
 * 2027" — before anything is written.
 */
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TextField, TextArea, SelectField } from "@/components/ui/fields";
import { TagInput } from "@/components/ui/TagInput";
import { pregnancyView } from "@/lib/healthContexts";
import {
  PREGNANCY_KEY,
  PREGNANCY_STATUS_LABELS,
  type HealthContext,
  type PregnancyContext,
  type PregnancyStatus,
} from "@/types/context";

interface PregnancyDraft {
  status: PregnancyStatus;
  lastMenstrualPeriod: string;
  estimatedDueDate: string;
  gravida: string;
  para: string;
  miscarriages: string;
  stillbirths: string;
  delivery: string;
  notes: string;
  complications: string[];
}

type PregnancyErrors = Partial<Record<keyof PregnancyDraft, string>>;

const DAY_MS = 86_400_000;
/** A term is dated 280 days from the first day of the last period. */
const TERM_DAYS = 280;
/** How far a clinician's due date may sit from the LMP date before we ask. */
const EDD_TOLERANCE_DAYS = 28;
/** Past this, the "last period" is more likely a mistyped year than an overdue baby. */
const MAX_AGE_DAYS = 315;

function toDraft(p: PregnancyContext): PregnancyDraft {
  const num = (n?: number) => (n != null ? String(n) : "");
  return {
    status: p.status,
    lastMenstrualPeriod: p.lastMenstrualPeriod ?? "",
    estimatedDueDate: p.estimatedDueDate ?? "",
    gravida: num(p.gravida),
    para: num(p.para),
    miscarriages: num(p.miscarriages),
    stillbirths: num(p.stillbirths),
    delivery: p.delivery ?? "",
    notes: p.notes ?? "",
    complications: p.complications ?? [],
  };
}

function numOrUndef(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function fromDraft(d: PregnancyDraft): PregnancyContext {
  return {
    status: d.status,
    lastMenstrualPeriod: d.lastMenstrualPeriod || undefined,
    estimatedDueDate: d.estimatedDueDate || undefined,
    gravida: numOrUndef(d.gravida),
    para: numOrUndef(d.para),
    miscarriages: numOrUndef(d.miscarriages),
    stillbirths: numOrUndef(d.stillbirths),
    delivery: d.delivery.trim() || undefined,
    notes: d.notes.trim() || undefined,
    complications: d.complications,
  };
}

/** `YYYY-MM-DD` in local time, so a date never shifts a day across time zones. */
function parseDay(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function countError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return "Use a whole number.";
  const n = Number(trimmed);
  if (n > 30) return "That looks too high — check the number.";
  return undefined;
}

/**
 * The dates have to agree with each other before they're stored, otherwise the
 * dashboard would confidently show a week that came from a typo.
 */
function validatePregnancy(draft: PregnancyDraft): PregnancyErrors {
  const errors: PregnancyErrors = {};
  const lmp = parseDay(draft.lastMenstrualPeriod);
  const edd = parseDay(draft.estimatedDueDate);
  const now = today();

  if (draft.lastMenstrualPeriod.trim() && !lmp) {
    errors.lastMenstrualPeriod = "Enter a valid date (day, month, year).";
  } else if (lmp) {
    if (lmp > now) {
      errors.lastMenstrualPeriod = "The first day of your last period can't be in the future.";
    } else if (daysBetween(lmp, now) > MAX_AGE_DAYS) {
      errors.lastMenstrualPeriod = "That's more than 45 weeks ago — check the date.";
    }
  }

  if (draft.estimatedDueDate.trim() && !edd) {
    errors.estimatedDueDate = "Enter a valid date (day, month, year).";
  } else if (edd) {
    if (lmp) {
      const gap = daysBetween(lmp, edd);
      if (gap <= 0) {
        errors.estimatedDueDate = "Your due date has to fall after the first day of your last period.";
      } else if (Math.abs(gap - TERM_DAYS) > EDD_TOLERANCE_DAYS) {
        errors.estimatedDueDate =
          "That's more than four weeks from the date your last period suggests — check one of the two.";
      }
    } else if (daysBetween(now, edd) > TERM_DAYS + EDD_TOLERANCE_DAYS) {
      errors.estimatedDueDate = "A due date that far ahead looks like a typo.";
    }
  }

  // An ongoing pregnancy with no dates can't say how far along it is — that's the
  // one thing this form exists to answer.
  if (draft.status === "ONGOING" && !lmp && !edd) {
    errors.lastMenstrualPeriod = "Add your last period or your due date so we can count the weeks.";
  }

  const gravida = numOrUndef(draft.gravida);
  if (numOrUndef(draft.para) != null && gravida != null && numOrUndef(draft.para)! > gravida) {
    errors.para = "Can't be more than the number of pregnancies.";
  }
  const losses = (numOrUndef(draft.miscarriages) ?? 0) + (numOrUndef(draft.stillbirths) ?? 0);
  if (gravida != null && losses > gravida) {
    errors.miscarriages = "Losses can't be more than the number of pregnancies.";
  }

  for (const key of ["gravida", "para", "miscarriages", "stillbirths"] as const) {
    const message = countError(draft[key]);
    if (message && !errors[key]) errors[key] = message;
  }

  if (draft.delivery.trim() && draft.status === "ONGOING") {
    errors.delivery = "Only record how it ended once the pregnancy is delivered or ended.";
  }
  if (!draft.delivery.trim() && draft.status !== "ONGOING") {
    errors.delivery = "Add how it ended, so the record says what happened.";
  }

  return errors;
}

/** A throwaway context, so the preview uses the same maths the dashboard will. */
function draftContext(draft: PregnancyDraft): HealthContext {
  return {
    id: "pregnancy-draft",
    kind: "LIFE_STAGE",
    key: PREGNANCY_KEY,
    pregnancy: fromDraft(draft),
    createdAt: "",
  };
}

/** Edit the pregnancy context's own facts. Nothing here touches a health record. */
export function PregnancyModal({
  open,
  current,
  onSave,
  onClose,
}: {
  open: boolean;
  current: PregnancyContext;
  onSave: (patch: PregnancyContext) => void;
  onClose: () => void;
}) {
  // Mounted fresh each time it opens, so it starts on what's on file — never a blank
  // copy laid over real dates.
  const [draft, setDraft] = useState<PregnancyDraft>(() => toDraft(current));
  const [showErrors, setShowErrors] = useState(false);

  const patch = (p: Partial<PregnancyDraft>) => setDraft((d) => ({ ...d, ...p }));

  const errors = useMemo(() => validatePregnancy(draft), [draft]);
  const shown: PregnancyErrors = showErrors ? errors : {};
  const blocked = Object.keys(errors).length > 0;

  // What these dates will read as, worked out the same way the dashboard does it.
  const preview = useMemo(() => pregnancyView(draftContext(draft)), [draft]);
  const derivedDue = preview.dueDateLabel;
  const previewLine =
    draft.status === "ONGOING"
      ? preview.age
        ? `${preview.ageLabel} · ${preview.trimesterLabel}`
        : "Add your last period or your due date to see how far along you are."
      : `${preview.statusLabel}${derivedDue ? ` · due ${derivedDue}` : ""}`;

  function save() {
    if (blocked) {
      setShowErrors(true);
      return;
    }
    onSave(fromDraft(draft));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pregnancy details"
      description="Only the facts that belong to the pregnancy itself. Everything else lives on your record."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={showErrors && blocked}>
            Save details
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Where it stands"
          value={draft.status}
          error={shown.status}
          onChange={(e) => patch({ status: e.target.value as PregnancyStatus })}
        >
          {(Object.keys(PREGNANCY_STATUS_LABELS) as PregnancyStatus[]).map((s) => (
            <option key={s} value={s}>
              {PREGNANCY_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="First day of last period"
            type="date"
            value={draft.lastMenstrualPeriod}
            max={new Date().toISOString().slice(0, 10)}
            error={shown.lastMenstrualPeriod}
            onChange={(e) => patch({ lastMenstrualPeriod: e.target.value })}
            optional
          />
          <TextField
            label="Due date"
            type="date"
            value={draft.estimatedDueDate}
            error={shown.estimatedDueDate}
            hint="Leave empty and we work it out from the date above."
            onChange={(e) => patch({ estimatedDueDate: e.target.value })}
            optional
          />
        </div>

        {/* The read-out: the same sentence the dashboard and profile will use. */}
        <div className="rounded-mhl-sm bg-mhl-sunk px-3.5 py-3">
          <p className="text-mhl-fine font-semibold text-mhl-ink">This will read as</p>
          <p className="mt-0.5 text-mhl-fine text-mhl-muted">{previewLine}</p>
          {derivedDue && (
            <p className="mt-1 text-mhl-fine text-mhl-muted">
              Estimated due date: <span className="font-semibold text-mhl-ink">{derivedDue}</span>
              {draft.estimatedDueDate ? "" : " — counted from your last period."}
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Pregnancy number"
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.gravida}
            placeholder="3"
            error={shown.gravida}
            onChange={(e) => patch({ gravida: e.target.value })}
            optional
          />
          <TextField
            label="Previous births"
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.para}
            placeholder="2"
            error={shown.para}
            onChange={(e) => patch({ para: e.target.value })}
            optional
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Miscarriages"
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.miscarriages}
            error={shown.miscarriages}
            onChange={(e) => patch({ miscarriages: e.target.value })}
            optional
          />
          <TextField
            label="Stillbirths"
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.stillbirths}
            error={shown.stillbirths}
            onChange={(e) => patch({ stillbirths: e.target.value })}
            optional
          />
        </div>

        <TagInput
          label="Complications"
          value={draft.complications}
          onChange={(complications) => patch({ complications })}
          placeholder="e.g. Anaemia, raised blood pressure"
          optional
        />

        <TextField
          label="How it ended"
          value={draft.delivery}
          placeholder="e.g. Spontaneous vaginal delivery at 39 weeks"
          error={shown.delivery}
          onChange={(e) => patch({ delivery: e.target.value })}
          optional
        />

        <TextArea
          label="Notes"
          value={draft.notes}
          placeholder="Anything you want kept next to these dates"
          onChange={(e) => patch({ notes: e.target.value })}
          optional
        />
      </div>
    </Modal>
  );
}
