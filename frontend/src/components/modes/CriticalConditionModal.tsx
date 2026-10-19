/**
 * CriticalConditionModal — pick which condition Critical mode focuses on.
 * Also handles first-time pregnancy entry (dates step).
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { AppMode } from "@/lib/appModes";
import { useAppMode } from "@/store/AppModeContext";
import { useContexts } from "@/store/ContextsContext";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { CONDITION_STATUS_LABELS, type Condition } from "@/types/health";
import { genId } from "@/lib/id";
import { conditionFromDraft, emptyConditionDraft, validateCondition } from "@/components/records/model";
import { ConditionFields } from "@/components/records/FieldSets";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Tag, conditionTone } from "@/components/ui/Tag";
import { PregnancyModal } from "@/components/context/PregnancyModal";
import { CheckIcon, ConditionIcon, PlusIcon } from "@/components/icons";

export function CriticalConditionModal({ open, mode, onClose, onDone }: {
  open: boolean; mode: AppMode; onClose: () => void; onDone: () => void;
}) {
  const isPreg = mode === "pregnancy";
  const { setMode, setCriticalConditionId, criticalConditionId } = useAppMode();
  const { conditions, addItem } = useRecords();
  const { openCondition, openPregnancy, pregnancy, updatePregnancy } = useContexts();
  const { canEdit } = useCareProxy();
  const [picked, setPicked] = useState(criticalConditionId);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyConditionDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pregOpen, setPregOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setPicked(criticalConditionId);
      setAdding(false);
      setDraft(emptyConditionDraft());
      setErrors({});
      setPregOpen(false);
    }
  }, [open, criticalConditionId]);

  if (isPreg) {
    return (
      <>
        <Modal
          open={open && !pregOpen}
          onClose={onClose}
          title="Start pregnancy mode"
          description="We'll open your pregnancy profile and bring antenatal visits, key readings and dates to the front."
          footer={
            <>
              <Button variant="secondary" onClick={onClose}>Not now</Button>
              <Button onClick={() => {
                if (pregnancy) { setMode("pregnancy"); onDone(); }
                else setPregOpen(true);
              }}>
                {pregnancy ? "Enter pregnancy mode" : "Continue"}
              </Button>
            </>
          }
        >
          <p className="text-mhl-body text-mhl-muted">
            {pregnancy
              ? "Your pregnancy profile is already on file — entering mode opens it."
              : "Next, add your dates so the dashboard can show how far along you are."}
          </p>
        </Modal>
        <PregnancyModal
          open={pregOpen}
          current={{ status: "ONGOING" }}
          onClose={() => setPregOpen(false)}
          onSave={(patch) => {
            const id = openPregnancy();
            updatePregnancy(id, patch);
            setMode("pregnancy");
            onDone();
          }}
        />
      </>
    );
  }
/* Critical-mode confirm */
  function confirm(id: string) {
    setCriticalConditionId(id);
    const c = conditions.find((x) => x.id === id);
    if (c) openCondition(c);
    setMode("critical");
    onDone();
  }

  function saveNew() {
    const errs = validateCondition(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const rec: Condition = { ...conditionFromDraft(draft), id: genId("cn") };
    addItem("conditions", rec);
    confirm(rec.id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Which condition needs the focus?"
      description="Critical mode brings one condition — its treatment, schedule and numbers — to the front of everything."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!picked || adding} onClick={() => picked && confirm(picked)}>
            Focus this condition
          </Button>
        </>
      }
    >
      {!adding ? (
        <div className="space-y-2">
          {conditions.map((c) => {
            const selected = c.id === picked;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setPicked(c.id)}
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-center gap-3 rounded-mhl-sm border p-3 text-left transition-colors",
                  selected ? "border-mhl-accent bg-mhl-accent-lo/60 ring-1 ring-mhl-accent" : "border-mhl-rule bg-mhl-surface hover:border-mhl-accent/40",
                )}
              >
                <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-full", selected ? "bg-mhl-accent text-white" : "bg-mhl-sunk text-mhl-muted")}>
                  <ConditionIcon size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-mhl-body font-semibold text-mhl-ink">{c.name}</span>
                    <Tag tone={conditionTone(c.status)}>{CONDITION_STATUS_LABELS[c.status]}</Tag>
                  </span>
                </span>
                {selected && <span className="flex-none text-mhl-accent"><CheckIcon size={19} /></span>}
              </button>
            );
          })}
          {canEdit && (
            <button
              type="button"
              onClick={() => { setAdding(true); setDraft(emptyConditionDraft()); setErrors({}); }}
              className="flex w-full items-center gap-3 rounded-mhl-sm border border-dashed border-mhl-rule p-3 text-left text-mhl-accent transition-colors hover:border-mhl-accent/60 hover:bg-mhl-accent-lo/40"
            >
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
                <PlusIcon size={19} strokeWidth={2.25} />
              </span>
              <span>
                <span className="block text-mhl-body font-semibold">Add a new condition</span>
                <span className="block text-mhl-fine text-mhl-muted">Name it and focus it right away.</span>
              </span>
            </button>
          )}
        </div>
      ) : (
        <div>
          <ConditionFields draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} errors={errors} />
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="md" onClick={() => setAdding(false)}>Back to list</Button>
            <Button size="md" onClick={saveNew}>Add & focus</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
