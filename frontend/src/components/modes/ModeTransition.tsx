/**
 * ModeTransition — the beat between two condition-aware modes.
 *
 * A mode switch re-sorts the whole home screen, and without a beat the page
 * reads as a flicker. This overlay holds the screen for a moment in the arriving
 * mode's own colour: the mode's mark (in Critical, the focused condition's own
 * family mark), the mode's name, one line of what it brings forward, and a thin
 * rule that reads as the record being sorted.
 *
 * It never gates data — modes are lenses over the same in-memory record — it
 * only covers the reflow. Anyone who asks for less motion gets the same card,
 * still, for a moment.
 */
import { useEffect, useRef, useState } from "react";
import { useAppMode } from "@/store/AppModeContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useRecords } from "@/store/RecordsContext";
import { useContexts } from "@/store/ContextsContext";
import { appModeMeta, type AppMode } from "@/lib/appModes";
import { guideFor } from "@/lib/conditionGuide";
import { pregnancyView } from "@/lib/healthContexts";
import { FamilyIcon } from "@/components/dashboard/CriticalDash";

const HOLD_MS = 1250;
const EXIT_MS = 400;

export function ModeTransition() {
  const { mode, criticalConditionId } = useAppMode();
  const { activeOwnerId } = useCareProxy();
  const { conditions } = useRecords();
  const { contexts } = useContexts();
  const prevMode = useRef<AppMode>(mode);
  // Stepping into another record also restores that person's mode. That is a record
  // switch, not a mode switch — ProfileTransition covers it, and saying "Elderly
  // mode" while the name on the screen changes would name the wrong thing.
  const prevOwner = useRef(activeOwnerId);
  const [shown, setShown] = useState<AppMode | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (prevOwner.current !== activeOwnerId) {
      prevOwner.current = activeOwnerId;
      prevMode.current = mode;
      return;
    }
    // First render isn't a switch: there is nothing to transition from.
    if (prevMode.current === mode) return;
    prevMode.current = mode;

    timers.current.forEach((t) => window.clearTimeout(t));
    setShown(mode);
    setLeaving(false);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduced ? 550 : HOLD_MS;
    timers.current = [
      window.setTimeout(() => setLeaving(true), hold),
      window.setTimeout(() => setShown(null), hold + (reduced ? 100 : EXIT_MS)),
    ];

    // A new mode is a new home screen: open it from the top, under the cover.
    if (window.location.pathname === "/app" || window.location.pathname === "/app/") {
      window.scrollTo({ top: 0 });
    }
  }, [mode, activeOwnerId]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  if (!shown) return null;

  const meta = appModeMeta(shown);
  const ModeIcon = meta.Icon;
  const focusCondition =
    conditions.find((c) => c.id === criticalConditionId) ??
    conditions.find((c) => c.status === "ACTIVE") ??
    conditions[0];
  const family =
    shown === "critical" && focusCondition ? guideFor(focusCondition).family : null;

  const pregCtx = contexts.find((c) => c.kind === "LIFE_STAGE");
  const pregView = pregCtx ? pregnancyView(pregCtx) : null;

  const info =
    shown === "pregnancy" && pregView?.ageLabel
      ? `${pregView.ageLabel} along${pregView.dueDateLabel ? ` · due ${pregView.dueDateLabel}` : ""}`
      : shown === "critical" && focusCondition
        ? `${focusCondition.name} leads — treatment, schedule and numbers first.`
        : meta.tagline;

  return (
    <div
      role="status"
      aria-live="polite"
      data-phase={leaving ? "out" : "in"}
      className="mhl-trans fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-mhl-bg px-6 text-center"
    >
      <span className="mhl-trans-mark relative grid h-20 w-20 place-items-center rounded-full bg-mhl-accent text-white shadow-[0_18px_40px_-20px_oklch(0.45_0.12_28/0.65)]">
        <span
          aria-hidden="true"
          className="mhl-trans-ring absolute inset-0 rounded-full ring-2 ring-mhl-accent/50"
        />
        {family ? <FamilyIcon family={family} size={34} /> : <ModeIcon size={34} strokeWidth={1.9} />}
      </span>

      <div className="min-w-0">
        <p className="mhl-trans-line text-mhl-answer font-bold tracking-[-0.03em] text-mhl-ink">
          {meta.pill}
        </p>
        <p className="mhl-trans-line mhl-trans-line-2 mx-auto mt-1.5 max-w-[32rem] text-mhl-body text-mhl-muted [text-wrap:pretty]">
          {info}
        </p>
      </div>

      <span
        aria-hidden="true"
        className="mhl-trans-line mhl-trans-line-3 block h-[3px] w-36 overflow-hidden rounded-full bg-mhl-sunk"
      >
        <span className="mhl-trans-bar block h-full w-1/2 rounded-full bg-mhl-accent" />
      </span>
    </div>
  );
}
