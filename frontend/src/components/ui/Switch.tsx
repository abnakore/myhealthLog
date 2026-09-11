import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Accessible name — the control is icon-free, so it needs a spoken label. */
  label: string;
  disabled?: boolean;
}

/** A small on/off control (role="switch") for a single boolean, like a medication's
    active state. The thumb slides; colour and position both signal the value. */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors duration-150 ease-mhl",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mhl-accent",
        "disabled:opacity-55 disabled:pointer-events-none",
        checked ? "bg-mhl-accent" : "bg-mhl-faint/45",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-mhl",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
