/**
 * CareFocusModal: focus on several conditions and life stages at once.
 *
 * The person ticks everything that applies (a pregnancy, any number of
 * conditions, elderly care). A live preview shows the order the fixed rules put
 * them in and why. Saving stores the list on the server, so the Copilot and the
 * emergency summary use the same order, and switches the dashboard to the
 * layout the top item asks for.
 */
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { hasFocus, primaryMode, rankFocus, toggleFocus, type FocusRef } from "@/lib/careFocus";
import { useAppMode } from "@/store/AppModeContext";
import { useContexts } from "@/store/ContextsContext";
import { useRecords } from "@/store/RecordsContext";
import { useCareFocus } from "@/store/careFocusStore";
import { apiErrorMessage } from "@/services/api";
import { CONDITION_STATUS_LABELS } from "@/types/health";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CheckIcon, ConditionIcon, HeartPulseIcon, LifebuoyIcon, SproutIcon } from "@/components/icons";

function Option({
  selected, onClick, icon, title, sub,
}: { selected: boolean; onClick: () => void; icon: ReactNode; title: string; sub: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-mhl-sm border p-3 text-left transition-colors",
        selected
          ? "border-mhl-accent bg-mhl-accent-lo/60 ring-1 ring-mhl-accent"
          : "border-mhl-rule bg-mhl-surface hover:border-mhl-accent/40",
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 flex-none place-items-center rounded-full",
          selected ? "bg-mhl-accent text-white" : "bg-mhl-sunk text-mhl-muted",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-mhl-body font-semibold text-mhl-ink">{title}</span>
        <span className="block truncate text-mhl-fine text-mhl-muted">{sub}</span>
      </span>
      <span
        className={cn(
          "grid h-6 w-6 flex-none place-items-center rounded-md border",
          selected ? "border-mhl-accent bg-mhl-accent text-white" : "border-mhl-rule",
        )}
      >
        {selected && <CheckIcon size={15} strokeWidth={2.5} />}
      </span>
    </button>
  );
}

export function CareFocusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refs, save } = useCareFocus();
  const { setMode, setCriticalConditionId } = useAppMode();
  const { conditions } = useRecords();
  const { pregnancy, openPregnancy, openCondition } = useContexts();
  const [draft, setDraft] = useState<FocusRef[]>(refs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the saved focus each time the dialog opens (adjusting state
  // during render, as React recommends, rather than in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(refs);
      setError(null);
    }
  }

  const preview = useMemo(() => rankFocus(draft, conditions), [draft, conditions]);
  const live = conditions.filter((c) => c.status !== "RESOLVED");

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (hasFocus(draft, { kind: "pregnancy" }) && !pregnancy) await openPregnancy();
      const ranked = await save(draft);
      const top = ranked[0];
      if (top?.kind === "condition") {
        setCriticalConditionId(top.id);
        const c = conditions.find((x) => x.id === top.id);
        if (c) void openCondition(c);
      }
      setMode(primaryMode(ranked));
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const flip = (ref: FocusRef) => setDraft((d) => toggleFocus(d, ref));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="What should the app focus on?"
      description="Tick everything that applies. The app ranks them with fixed safety rules and uses that order on your dashboard, your emergency summary and in the Health Copilot."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? "Saving..." : draft.length ? "Save focus" : "Clear focus"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Option
          selected={hasFocus(draft, { kind: "pregnancy" })}
          onClick={() => flip({ kind: "pregnancy" })}
          icon={<SproutIcon size={19} />}
          title="Pregnancy"
          sub={pregnancy ? "Your pregnancy profile is on file." : "A pregnancy profile will be created."}
        />
        {live.map((c) => (
          <Option
            key={c.id}
            selected={hasFocus(draft, { kind: "condition", id: c.id })}
            onClick={() => flip({ kind: "condition", id: c.id })}
            icon={<ConditionIcon size={19} />}
            title={c.name}
            sub={`${CONDITION_STATUS_LABELS[c.status]}${c.severity ? `, ${c.severity.toLowerCase()}` : ""}`}
          />
        ))}
        <Option
          selected={hasFocus(draft, { kind: "elderly" })}
          onClick={() => flip({ kind: "elderly" })}
          icon={<LifebuoyIcon size={19} />}
          title="Elderly care"
          sub="Larger text, fewer choices, medication reminders."
        />
      </div>

      {preview.length > 0 && (
        <div className="mt-4 rounded-mhl-sm border border-mhl-rule bg-mhl-sunk/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-mhl-fine font-semibold uppercase tracking-wide text-mhl-muted">
            <HeartPulseIcon size={14} /> Order of priority
          </p>
          <ol className="space-y-1.5">
            {preview.map((p) => (
              <li key={`${p.kind}:${p.id}`} className="flex gap-2 text-mhl-fine">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-mhl-accent text-[0.7rem] font-bold text-white">
                  {p.rank}
                </span>
                <span className="min-w-0">
                  <b className="text-mhl-ink">{p.label}</b>
                  <span className="text-mhl-muted">. {p.reason}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[0.72rem] text-mhl-faint">
            The first item sets the dashboard layout. The others still appear on it.
          </p>
        </div>
      )}
      {error && <p className="mt-3 text-mhl-fine font-semibold text-mhl-danger">{error}</p>}
    </Modal>
  );
}
