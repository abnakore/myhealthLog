/**
 * FocusStrip: the whole care focus on the dashboard, in rule order.
 *
 * The first item already shapes the page (its own dashboard layout), so this
 * strip names every item in order and gives each of the others a compact card:
 * the medicines and the latest reading linked to it, or the pregnancy week.
 * Nothing here is clinical judgement; the order comes from lib/careFocus.ts.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { pregnancyView } from "@/lib/healthContexts";
import { useCareFocus } from "@/store/careFocusStore";
import { useContexts } from "@/store/ContextsContext";
import { useRecords } from "@/store/RecordsContext";
import { formatVitalValue, vitalName } from "@/types/health";
import { CareFocusModal } from "@/components/modes/CareFocusModal";
import { ConditionIcon, HeartPulseIcon, LifebuoyIcon, SproutIcon } from "@/components/icons";

export function FocusStrip({ canEdit }: { canEdit: boolean }) {
  const { ranked } = useCareFocus();
  const { medications, vitals } = useRecords();
  const { contextFor, pregnancy } = useContexts();
  const [open, setOpen] = useState(false);

  if (ranked.length === 0) {
    if (!canEdit) return null;
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-mhl border border-dashed border-mhl-rule px-4 py-3 text-left text-mhl-fine text-mhl-muted transition-colors hover:border-mhl-accent/50 hover:text-mhl-ink"
        >
          <HeartPulseIcon size={18} />
          <span>
            Living with more than one condition, or pregnant with one? <b className="text-mhl-accent">Set your care focus</b>{" "}
            and the app will rank them for you.
          </span>
        </button>
        <CareFocusModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  const others = ranked.slice(1);

  return (
    <section aria-labelledby="focus-title" className="rounded-mhl border border-mhl-rule bg-mhl-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="focus-title" className="flex items-center gap-2 text-mhl-fine font-bold uppercase tracking-wide text-mhl-muted">
          <HeartPulseIcon size={15} /> Care focus
        </h2>
        {canEdit && (
          <button type="button" onClick={() => setOpen(true)} className="text-mhl-fine font-semibold text-mhl-accent hover:underline">
            Change focus
          </button>
        )}
      </div>
      <ol className="mt-2 flex flex-wrap gap-2">
        {ranked.map((r) => (
          <li
            key={`${r.kind}:${r.id}`}
            title={r.reason}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-mhl-fine font-semibold",
              r.rank === 1 ? "border-mhl-accent bg-mhl-accent-lo text-mhl-accent" : "border-mhl-rule text-mhl-ink",
            )}
          >
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full text-[0.7rem] font-bold",
                r.rank === 1 ? "bg-mhl-accent text-white" : "bg-mhl-sunk text-mhl-muted",
              )}
            >
              {r.rank}
            </span>
            {r.label}
          </li>
        ))}
      </ol>
      {others.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((r) => {
            if (r.kind === "condition") {
              const meds = medications.filter((m) => m.active !== false && m.conditionIds?.includes(r.id));
              const latest = [...vitals]
                .filter((v) => v.conditionIds?.includes(r.id))
                .sort((a, b) => (b.measuredAt ?? "").localeCompare(a.measuredAt ?? ""))[0];
              const ctx = contextFor(r.id);
              return (
                <Link
                  key={`c:${r.id}`}
                  to={ctx ? `/app/contexts/${ctx.id}` : `/app/records/conditions/${r.id}`}
                  className="mhl-interactive block rounded-mhl-sm border border-mhl-rule p-3"
                >
                  <p className="flex items-center gap-2 text-mhl-body font-semibold text-mhl-ink">
                    <ConditionIcon size={16} /> {r.label}
                  </p>
                  <p className="mt-0.5 text-mhl-fine text-mhl-muted">{r.reason}</p>
                  <p className="mt-1.5 text-mhl-fine text-mhl-ink">
                    {meds.length ? `${meds.length} medicine${meds.length === 1 ? "" : "s"}: ${meds.map((m) => m.name).join(", ")}` : "No medicines linked yet"}
                  </p>
                  {latest && (
                    <p className="text-mhl-fine text-mhl-muted">
                      Latest {vitalName(latest).toLowerCase()}: {formatVitalValue(latest)}
                    </p>
                  )}
                </Link>
              );
            }
            if (r.kind === "pregnancy") {
              const view = pregnancy ? pregnancyView(pregnancy) : null;
              return (
                <Link
                  key="pregnancy"
                  to={pregnancy ? `/app/contexts/${pregnancy.id}` : "/app/contexts"}
                  className="mhl-interactive block rounded-mhl-sm border border-mhl-rule p-3"
                >
                  <p className="flex items-center gap-2 text-mhl-body font-semibold text-mhl-ink">
                    <SproutIcon size={16} /> Pregnancy
                  </p>
                  <p className="mt-0.5 text-mhl-fine text-mhl-muted">{r.reason}</p>
                  {view?.ageLabel && <p className="mt-1.5 text-mhl-fine text-mhl-ink">{view.ageLabel}</p>}
                </Link>
              );
            }
            return (
              <div key="elderly" className="rounded-mhl-sm border border-mhl-rule p-3">
                <p className="flex items-center gap-2 text-mhl-body font-semibold text-mhl-ink">
                  <LifebuoyIcon size={16} /> Elderly care
                </p>
                <p className="mt-0.5 text-mhl-fine text-mhl-muted">{r.reason}</p>
              </div>
            );
          })}
        </div>
      )}
      <CareFocusModal open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
