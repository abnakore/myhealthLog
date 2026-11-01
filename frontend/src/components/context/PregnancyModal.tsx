/**
 * The pregnancy context's own facts — the small set of things a generic health record
 * genuinely can't hold: how it's going, the dates, and the obstetric history.
 *
 * Everything else about a pregnancy is an existing record and stays one. There is no
 * "pregnancy medication" here and no "pregnancy lab" — just dates, so the profile can
 * say how far along it is and what is due when.
 */
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TextField, TextArea, SelectField } from "@/components/ui/fields";
import { TagInput } from "@/components/ui/TagInput";
import {
  PREGNANCY_STATUS_LABELS,
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
  const [draft, setDraft] = useState<PregnancyDraft>(() => toDraft(current));

  // Start each time from what's on file, so a cancelled edit doesn't linger.
  useEffect(() => {
    if (open) setDraft(toDraft(current));
  }, [open, current]);

  const patch = (p: Partial<PregnancyDraft>) => setDraft((d) => ({ ...d, ...p }));

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
          <Button onClick={() => onSave(fromDraft(draft))}>Save details</Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Where it stands"
          value={draft.status}
          onChange={(e) => patch({ status: e.target.value as PregnancyStatus })}
        >
          {(Object.keys(PREGNANCY_STATUS_LABELS) as PregnancyStatus[]).map((s) => (
            <option key={s} value={s}>
              {PREGNANCY_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="First day of last period"
            type="date"
            value={draft.lastMenstrualPeriod}
            onChange={(e) => patch({ lastMenstrualPeriod: e.target.value })}
            optional
          />
          <TextField
            label="Due date"
            type="date"
            value={draft.estimatedDueDate}
            hint="Leave empty and we work it out from the date above."
            onChange={(e) => patch({ estimatedDueDate: e.target.value })}
            optional
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Pregnancy number"
            type="number"
            value={draft.gravida}
            placeholder="3"
            onChange={(e) => patch({ gravida: e.target.value })}
            optional
          />
          <TextField
            label="Previous births"
            type="number"
            value={draft.para}
            placeholder="2"
            onChange={(e) => patch({ para: e.target.value })}
            optional
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Miscarriages"
            type="number"
            value={draft.miscarriages}
            onChange={(e) => patch({ miscarriages: e.target.value })}
            optional
          />
          <TextField
            label="Stillbirths"
            type="number"
            value={draft.stillbirths}
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
