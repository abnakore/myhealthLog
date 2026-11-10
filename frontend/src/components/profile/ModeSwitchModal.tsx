import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CheckIcon, LayersIcon } from "@/components/icons";
import { APP_MODES, type AppMode } from "@/lib/appModes";
import { useAppMode } from "@/store/AppModeContext";
import { useRecords } from "@/store/RecordsContext";
import { useContexts } from "@/store/ContextsContext";
import { CriticalConditionModal } from "@/components/modes/CriticalConditionModal";
import { CareFocusModal } from "@/components/modes/CareFocusModal";
import { useFocusFacets, usePickMode } from "@/store/careFocusStore";

/** A single mode, or "several at once" (the care focus dialog). */
type Choice = AppMode | "several";

/** Pick the condition-aware mode. Selection is staged locally so the switch is
    deliberate — nothing changes until "Switch mode". Modes that need a
    subject (critical → a condition, pregnancy → dates on first entry) route
    through the focus picker after confirm, so the mode never lands blind. */
export function ModeSwitchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mode } = useAppMode();
  const facets = useFocusFacets();
  const pickMode = usePickMode();
  const current: Choice = facets.multi ? "several" : mode;
  const [severalOpen, setSeveralOpen] = useState(false);
  const { conditions } = useRecords();
  const { contexts } = useContexts();
  const [pending, setPending] = useState<Choice>(current);
  const [focusOpen, setFocusOpen] = useState(false);

  // Re-sync to the live mode each time it opens, so a cancelled change doesn't stick.
  useEffect(() => {
    if (open) {
      setPending(current);
      setFocusOpen(false);
    }
  }, [open, current]);

  const selected = APP_MODES.find((m) => m.id === pending);
  // "Several at once" always opens the dialog, so it can be edited again.
  const unchanged = pending === current && pending !== "several";
  const hasPreg = contexts.some((c) => c.kind === "LIFE_STAGE");
  const needsFocus =
    (pending === "critical" && conditions.length !== 1) ||
    (pending === "pregnancy" && !hasPreg);

  function apply() {
    if (pending === "several") {
      setSeveralOpen(true);
      return;
    }
    if (needsFocus) {
      setFocusOpen(true);
      return;
    }
    pickMode(pending, pending === "critical" ? conditions[0]?.id : undefined);
    onClose();
  }

  return (
    <>
    <Modal
      open={open && !focusOpen && !severalOpen}
      onClose={onClose}
      title="How should the app work for you?"
      description="Pick the focus that fits your life right now. You can change this any time."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={unchanged}>
            {unchanged ? "Current mode" : pending === "several" ? "Choose what to focus on" : "Switch mode"}
          </Button>
        </>
      }
    >
      <div className="space-y-2.5">
        {APP_MODES.map((m) => {
          const active = m.id === pending;
          const Icon = m.Icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setPending(m.id)}
              aria-pressed={active}
              className={cn(
                "flex w-full items-center gap-3.5 rounded-mhl-sm border p-3.5 text-left transition-colors",
                active
                  ? "border-mhl-accent bg-mhl-accent-lo/60 ring-1 ring-mhl-accent"
                  : "border-mhl-rule bg-mhl-surface hover:border-mhl-accent/40",
              )}
            >
              <span
                className={cn(
                  "grid h-10 w-10 flex-none place-items-center rounded-full transition-colors",
                  active ? "bg-mhl-accent text-white" : "bg-mhl-sunk text-mhl-muted",
                )}
              >
                <Icon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-mhl-body font-semibold text-mhl-ink">{m.label}</span>
                  {m.id === current && <span className="text-mhl-fine text-mhl-muted">· in use</span>}
                </span>
                <span className="mt-0.5 block text-mhl-fine text-mhl-muted">{m.tagline}</span>
              </span>
              {active && (
                <span className="flex-none text-mhl-accent">
                  <CheckIcon size={20} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setPending("several")}
        aria-pressed={pending === "several"}
        className={cn(
          "mt-2.5 flex w-full items-center gap-3.5 rounded-mhl-sm border p-3.5 text-left transition-colors",
          pending === "several"
            ? "border-mhl-accent bg-mhl-accent-lo/60 ring-1 ring-mhl-accent"
            : "border-mhl-rule bg-mhl-surface hover:border-mhl-accent/40",
        )}
      >
        <span
          className={cn(
            "grid h-10 w-10 flex-none place-items-center rounded-full transition-colors",
            pending === "several" ? "bg-mhl-accent text-white" : "bg-mhl-sunk text-mhl-muted",
          )}
        >
          <LayersIcon size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-mhl-body font-semibold text-mhl-ink">Several at once</span>
            {current === "several" && <span className="text-mhl-fine text-mhl-muted">· in use</span>}
          </span>
          <span className="mt-0.5 block text-mhl-fine text-mhl-muted">
            {facets.multi
              ? facets.ranked.map((r) => r.label).join(", ")
              : "Pregnancy, conditions and elderly care together. Each one adapts the app."}
          </span>
        </span>
        {pending === "several" && (
          <span className="flex-none text-mhl-accent">
            <CheckIcon size={20} />
          </span>
        )}
      </button>

      {selected && (
      <div className="mt-4 rounded-mhl-sm bg-mhl-sunk p-3.5">
        <p className="text-mhl-fine font-semibold text-mhl-ink">Brings forward</p>
        <ul className="mt-1.5 space-y-1">
          {selected.focus.map((f) => (
            <li key={f} className="flex items-start gap-2 text-mhl-fine text-mhl-muted">
              <span className="mt-[0.4rem] h-1 w-1 flex-none rounded-full bg-mhl-accent" />
              {f}
            </li>
          ))}
        </ul>
      </div>
      )}
    </Modal>
    <CareFocusModal
      open={severalOpen}
      onClose={() => {
        setSeveralOpen(false);
        onClose();
      }}
    />
    <CriticalConditionModal
      open={focusOpen}
      mode={pending === "several" ? "critical" : pending}
      onClose={() => setFocusOpen(false)}
      onDone={() => {
        setFocusOpen(false);
        onClose();
      }}
    />
    </>
  );
}
