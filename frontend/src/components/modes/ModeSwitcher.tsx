/**
 * ModeSwitcher: the "You're viewing" dropdown in the rail (and a row of chips
 * on a phone). Shown in every mode, Normal included.
 *
 * It offers the four single modes and "Focus on several at once". Picking a
 * single mode replaces the whole care focus with that mode; picking several
 * opens the care focus dialog. Critical mode asks which condition first, and
 * pregnancy asks for dates the first time, because a focus needs a subject.
 * A mode is a lens, never a rewrite: switching never touches a record.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { APP_MODES, appModeMeta, type AppMode } from "@/lib/appModes";
import { useAppMode } from "@/store/AppModeContext";
import { useContexts } from "@/store/ContextsContext";
import { useRecords } from "@/store/RecordsContext";
import { useFocusFacets, usePickMode } from "@/store/careFocusStore";
import { CheckIcon, ChevronDownIcon, LayersIcon } from "@/components/icons";
import { CriticalConditionModal } from "./CriticalConditionModal";
import { CareFocusModal } from "./CareFocusModal";

export function ModeSwitcher({ compact = false }: { compact?: boolean }) {
  const { mode } = useAppMode();
  const facets = useFocusFacets();
  const pickMode = usePickMode();
  const { contexts } = useContexts();
  const { conditions } = useRecords();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<AppMode | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const meta = appModeMeta(mode);
  const Icon = meta.Icon;
  const hasPreg = contexts.some((c) => c.kind === "LIFE_STAGE");
  const multi = facets.multi;
  const multiLabels = facets.ranked.map((r) => r.label).join(", ");

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: AppMode) {
    setOpen(false);
    // Already showing just this mode: nothing to do. After a focus on several,
    // picking the same mode still narrows the focus down to it.
    if (next === mode && !multi) return;
    if (next === "critical") {
      // With exactly one condition the choice is unambiguous; otherwise ask.
      if (conditions.length === 1) pickMode("critical", conditions[0].id);
      else {
        setPendingMode("critical");
        setPickerOpen(true);
      }
      return;
    }
    if (next === "pregnancy" && !hasPreg) {
      setPendingMode("pregnancy");
      setPickerOpen(true);
      return;
    }
    pickMode(next);
  }

  function openSeveral() {
    setOpen(false);
    setFocusOpen(true);
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      {compact ? (
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Switch app mode">
          {APP_MODES.map((m) => {
            const MIcon = m.Icon;
            const selected = !multi && m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(m.id)}
                className={cn(
                  "flex flex-none items-center gap-1.5 rounded-full border px-3 py-2 text-mhl-fine font-semibold",
                  selected
                    ? "border-mhl-accent bg-mhl-accent-lo text-mhl-accent"
                    : "border-mhl-rule bg-mhl-surface text-mhl-muted",
                )}
              >
                <MIcon size={15} />
                {m.label}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={multi}
            onClick={openSeveral}
            className={cn(
              "flex flex-none items-center gap-1.5 rounded-full border px-3 py-2 text-mhl-fine font-semibold",
              multi
                ? "border-mhl-accent bg-mhl-accent-lo text-mhl-accent"
                : "border-mhl-rule bg-mhl-surface text-mhl-muted",
            )}
          >
            <LayersIcon size={15} />
            {multi ? `Several (${facets.ranked.length})` : "Several at once"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-mhl-sm border border-mhl-rule bg-mhl-surface px-3 py-2.5 text-left",
            "transition-all duration-200 ease-mhl hover:-translate-y-px hover:shadow-[0_8px_20px_-12px_oklch(0.45_0.05_60)]",
            open ? "border-mhl-accent/50" : "hover:border-mhl-accent/40",
          )}
        >
          <span className="relative grid h-8 w-8 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
            {multi ? <LayersIcon size={18} /> : <Icon size={18} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-mhl-fine font-bold text-mhl-ink">
              {multi ? "Several at once" : meta.pill}
            </span>
            <span className="block truncate text-[0.75rem] text-mhl-muted">
              {multi ? multiLabels : meta.tagline}
            </span>
          </span>
          <span className={cn("flex-none text-mhl-muted transition-transform duration-200", open && "rotate-180")}>
            <ChevronDownIcon size={16} />
          </span>
        </button>
      )}
      {open && (
        <div
          role="menu"
          aria-label="Switch app mode"
          className="absolute inset-x-0 top-full z-40 mt-2 origin-top overflow-hidden rounded-mhl-sm border border-mhl-rule bg-mhl-surface p-1.5 shadow-[0_20px_44px_-20px_oklch(0.35_0.04_60)]"
        >
          {APP_MODES.map((m, i) => {
            const MIcon = m.Icon;
            const selected = !multi && m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => choose(m.id)}
                style={{ animationDelay: `${i * 35}ms` }}
                className={cn(
                  "mhl-mode-item flex w-full items-center gap-2.5 rounded-[0.6rem] px-2.5 py-2 text-left transition-colors duration-150",
                  selected ? "bg-mhl-accent-lo" : "hover:bg-mhl-sunk",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 flex-none place-items-center rounded-full",
                    selected ? "bg-mhl-accent text-white" : "bg-mhl-sunk text-mhl-muted",
                  )}
                >
                  <MIcon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-mhl-fine font-bold text-mhl-ink">{m.pill}</span>
                  <span className="block truncate text-[0.72rem] text-mhl-muted">{m.tagline}</span>
                </span>
                {selected && (
                  <span className="flex-none text-mhl-accent">
                    <CheckIcon size={17} />
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={multi}
            onClick={openSeveral}
            className={cn(
              "mt-1 flex w-full items-center gap-2.5 rounded-[0.6rem] border-t border-mhl-rule px-2.5 py-2 text-left transition-colors duration-150",
              multi ? "bg-mhl-accent-lo" : "hover:bg-mhl-sunk",
            )}
          >
            <span
              className={cn(
                "grid h-8 w-8 flex-none place-items-center rounded-full",
                multi ? "bg-mhl-accent text-white" : "bg-mhl-sunk text-mhl-muted",
              )}
            >
              <LayersIcon size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-mhl-fine font-bold text-mhl-ink">Focus on several at once</span>
              <span className="block truncate text-[0.72rem] text-mhl-muted">
                {multi ? multiLabels : "For example pregnancy and elderly care together"}
              </span>
            </span>
            {multi && (
              <span className="flex-none text-mhl-accent">
                <CheckIcon size={17} />
              </span>
            )}
          </button>
          <p className="px-2.5 pb-1.5 pt-2 text-[0.72rem] leading-snug text-mhl-faint">
            Switching changes focus only. Your full record stays untouched.
          </p>
        </div>
      )}
      <CareFocusModal open={focusOpen} onClose={() => setFocusOpen(false)} />
      <CriticalConditionModal
        open={pickerOpen}
        mode={pendingMode ?? "critical"}
        onClose={() => {
          setPickerOpen(false);
          setPendingMode(null);
        }}
        onDone={() => {
          setPickerOpen(false);
          setPendingMode(null);
        }}
      />
    </div>
  );
}
