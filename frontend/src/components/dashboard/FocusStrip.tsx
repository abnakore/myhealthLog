/**
 * FocusStrip: the care focus on the home screen, in rule order.
 *
 * Shown only when several things are in focus. Each one already adapts the
 * page itself (the leading mode's layout, a panel for every other condition,
 * the elderly sizing and medication reminders), so this strip names them in
 * order and says what each one changed. With one mode on its own there is
 * nothing to rank, so it stays out of the way; in Normal mode it offers the
 * way in. The order comes from lib/careFocus.ts, never from judgement here.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useAppMode } from "@/store/AppModeContext";
import { useFocusFacets } from "@/store/careFocusStore";
import { CareFocusModal } from "@/components/modes/CareFocusModal";
import { ConditionIcon, ElderlyCoupleIcon, LayersIcon, PregnantIcon } from "@/components/icons";
import type { RankedFocus } from "@/lib/careFocus";

function adapted(r: RankedFocus): string {
  if (r.kind === "pregnancy") return "Leads the page: week, due date, antenatal readings and visits.";
  if (r.kind === "elderly") return "Larger text and buttons, a simpler menu, medication reminders below.";
  return r.rank === 1
    ? "Leads the page: status, readings, medicines and care plan."
    : "Its own panel below: status, readings and medicines.";
}

function FocusIcon({ r, size }: { r: RankedFocus; size: number }) {
  if (r.kind === "pregnancy") return <PregnantIcon size={size} />;
  if (r.kind === "elderly") return <ElderlyCoupleIcon size={size} />;
  return <ConditionIcon size={size} />;
}

export function FocusStrip({ canEdit }: { canEdit: boolean }) {
  const { mode } = useAppMode();
  const facets = useFocusFacets();
  const [open, setOpen] = useState(false);

  if (!facets.multi) {
    if (!canEdit || mode !== "standard") return null;
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-mhl border border-dashed border-mhl-rule px-4 py-3 text-left text-mhl-fine text-mhl-muted transition-colors hover:border-mhl-accent/50 hover:text-mhl-ink"
        >
          <LayersIcon size={18} />
          <span>
            Pregnant with a condition, or caring for an older relative with one?{" "}
            <b className="text-mhl-accent">Focus on several at once</b> and the app adapts to all of them.
          </span>
        </button>
        <CareFocusModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <section aria-labelledby="focus-title" className="rounded-mhl border border-mhl-rule bg-mhl-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="focus-title" className="flex items-center gap-2 text-mhl-fine font-bold uppercase tracking-wide text-mhl-muted">
          <LayersIcon size={15} /> Care focus
        </h2>
        {canEdit && (
          <button type="button" onClick={() => setOpen(true)} className="text-mhl-fine font-semibold text-mhl-accent hover:underline">
            Change focus
          </button>
        )}
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {facets.ranked.map((r) => (
          <li
            key={`${r.kind}:${r.id}`}
            className={cn(
              "flex min-w-0 items-start gap-2.5 rounded-mhl-sm border px-3 py-2.5",
              r.rank === 1 ? "border-mhl-accent/50 bg-mhl-accent-lo/60" : "border-mhl-rule",
            )}
          >
            <span
              className={cn(
                "grid h-8 w-8 flex-none place-items-center rounded-full",
                r.rank === 1 ? "bg-mhl-accent text-white" : "bg-mhl-sunk text-mhl-muted",
              )}
            >
              <FocusIcon r={r} size={16} />
            </span>
            <span className="min-w-0">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[0.72rem] font-bold text-mhl-faint">{r.rank}.</span>
                <span className="truncate text-mhl-fine font-bold text-mhl-ink">{r.label}</span>
              </span>
              <span className="block text-[0.78rem] leading-snug text-mhl-muted">{adapted(r)}</span>
            </span>
          </li>
        ))}
      </ol>
      <CareFocusModal open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
