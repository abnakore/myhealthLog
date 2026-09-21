import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/icons";
import { SHARE_SCOPES, SHARE_SCOPE_LABELS, type ShareScope } from "@/types/sharing";

interface ScopeChecklistProps {
  value: ShareScope[];
  onChange: (next: ShareScope[]) => void;
  /** Shown in danger when the caller wants to flag "pick at least one". */
  error?: string;
}

/** The scope picker shared by the provider grant flow and the circle-of-trust form:
    tick exactly which parts of the record a person can see. Selection is kept in the
    canonical SHARE_SCOPES order, so a saved grant always reads the same way. */
export function ScopeChecklist({ value, onChange, error }: ScopeChecklistProps) {
  const selected = new Set(value);
  const allOn = value.length === SHARE_SCOPES.length;

  function toggle(scope: ShareScope) {
    const next = new Set(selected);
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    onChange(SHARE_SCOPES.filter((s) => next.has(s)));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className={cn("text-mhl-fine", error ? "text-mhl-danger" : "text-mhl-muted")}>
          {error ?? `${value.length} of ${SHARE_SCOPES.length} selected`}
        </span>
        <button
          type="button"
          onClick={() => onChange(allOn ? [] : [...SHARE_SCOPES])}
          className="flex-none text-mhl-fine font-semibold text-mhl-accent transition-colors hover:text-mhl-accent-strong"
        >
          {allOn ? "Clear all" : "Select all"}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {SHARE_SCOPES.map((scope) => {
          const on = selected.has(scope);
          return (
            <button
              key={scope}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(scope)}
              className={cn(
                "flex items-center gap-2.5 rounded-mhl-sm border px-3 py-2.5 text-left transition-colors",
                on ? "border-mhl-accent bg-mhl-accent-lo" : "border-mhl-rule hover:bg-mhl-sunk",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 flex-none place-items-center rounded-md border transition-colors",
                  on
                    ? "border-mhl-accent bg-mhl-accent text-white"
                    : "border-mhl-faint bg-mhl-surface text-transparent",
                )}
              >
                <CheckIcon size={14} strokeWidth={3} />
              </span>
              <span className={cn("text-mhl-body text-mhl-ink", on && "font-semibold")}>
                {SHARE_SCOPE_LABELS[scope]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
