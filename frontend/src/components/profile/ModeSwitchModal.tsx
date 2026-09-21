import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CheckIcon } from "@/components/icons";
import { APP_MODES, type AppMode } from "@/lib/appModes";
import { useAppMode } from "@/store/AppModeContext";

/** Pick the condition-aware mode. Selection is staged locally so the switch is
    deliberate — nothing changes until "Switch mode". */
export function ModeSwitchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mode, setMode } = useAppMode();
  const [pending, setPending] = useState<AppMode>(mode);

  // Re-sync to the live mode each time it opens, so a cancelled change doesn't stick.
  useEffect(() => {
    if (open) setPending(mode);
  }, [open, mode]);

  const selected = APP_MODES.find((m) => m.id === pending) ?? APP_MODES[0];
  const unchanged = pending === mode;

  function apply() {
    setMode(pending);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How should the app work for you?"
      description="Pick the focus that fits your life right now. You can change this any time."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={unchanged}>
            {unchanged ? "Current mode" : "Switch mode"}
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
                  {m.id === mode && <span className="text-mhl-fine text-mhl-muted">· in use</span>}
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
    </Modal>
  );
}
