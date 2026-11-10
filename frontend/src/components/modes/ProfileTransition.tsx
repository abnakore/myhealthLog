/**
 * ProfileTransition — the beat when the *lens* changes, matching the one a mode
 * switch gets.
 *
 * Two things in this app change what the same record looks like: stepping into
 * another person's record (the "You're viewing" switcher), and opening a
 * condition-aware profile. Both re-sort the same screens, so both get the same short
 * cover: who/what you're now reading, and one line of what that means. It never
 * gates data — the record is already there — and it stays put for anyone who asks
 * for less motion.
 *
 * A mode change deliberately does not fire this: ModeTransition already covers that
 * beat, and ModeSync activates the matching profile behind it. For a moment after a
 * mode change, profile activations are treated as part of that same beat.
 */
import { useEffect, useRef, useState } from "react";
import { ConditionIcon } from "@/components/icons";
import { useCareProxy } from "@/store/CareProxyContext";
import { useContexts } from "@/store/ContextsContext";
import { useAppMode } from "@/store/AppModeContext";

const HOLD_MS = 1000;
const EXIT_MS = 380;
/** How long after a mode change a profile activation is assumed to be ModeSync's. */
const MODE_SUPPRESS_MS = 1600;

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

interface Beat {
  kind: "record" | "profile";
  eyebrow: string;
  title: string;
  line: string;
}

export function ProfileTransition() {
  const { activeOwnerId, activeOwnerName, isProxyView } = useCareProxy();
  const { activeId, activeLabel } = useContexts();
  const { mode } = useAppMode();
  const prev = useRef({ activeId, activeOwnerId, mode });
  const suppressUntil = useRef(0);
  const [beat, setBeat] = useState<Beat | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const last = prev.current;
    const modeChanged = last.mode !== mode;
    const ownerChanged = last.activeOwnerId !== activeOwnerId;
    prev.current = { activeId, activeOwnerId, mode };

    // Another person's record also restores their mode. The record beat wins — it
    // names the thing that actually changed — and the mode beat stands down for it.
    if (!ownerChanged && modeChanged) {
      suppressUntil.current = Date.now() + MODE_SUPPRESS_MS;
      return;
    }

    let next: Beat | null = null;
    if (ownerChanged) {
      next = {
        kind: "record",
        eyebrow: isProxyView ? "Record switched" : "Back to your record",
        title: isProxyView ? activeOwnerName : "Your own record",
        line: isProxyView
          ? "You're now reading their record with the access they gave you."
          : "Back to the record that is yours, everything as you left it.",
      };
    } else if (last.activeId !== activeId && activeId) {
      if (Date.now() < suppressUntil.current) return;
      next = {
        kind: "profile",
        eyebrow: "Profile in focus",
        title: activeLabel || "Profile",
        line: "Reading the record through this profile. Nothing is copied, hidden or moved.",
      };
    }
    if (!next) return;

    timers.current.forEach((t) => window.clearTimeout(t));
    setBeat(next);
    setLeaving(false);
    timers.current = [
      window.setTimeout(() => setLeaving(true), HOLD_MS),
      window.setTimeout(() => setBeat(null), HOLD_MS + EXIT_MS),
    ];
  }, [activeId, activeOwnerId, activeOwnerName, activeLabel, isProxyView, mode]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  if (!beat) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-phase={leaving ? "out" : "in"}
      className="mhl-trans fixed inset-0 z-[61] flex flex-col items-center justify-center gap-5 bg-mhl-bg px-6 text-center"
    >
      <span className="mhl-trans-mark relative grid h-20 w-20 place-items-center rounded-full bg-mhl-accent text-white shadow-[0_18px_40px_-20px_oklch(0.45_0.12_28/0.65)]">
        <span
          aria-hidden="true"
          className="mhl-trans-ring absolute inset-0 rounded-full ring-2 ring-mhl-accent/50"
        />
        {beat.kind === "record" ? (
          <span className="text-[1.6rem] font-bold tracking-[-0.02em]">
            {initials(beat.title)}
          </span>
        ) : (
          <ConditionIcon size={34} strokeWidth={1.9} />
        )}
      </span>

      <div className="min-w-0">
        <p className="mhl-trans-line text-mhl-fine font-bold uppercase tracking-[0.14em] text-mhl-accent">
          {beat.eyebrow}
        </p>
        <p className="mhl-trans-line text-mhl-answer font-bold tracking-[-0.03em] text-mhl-ink">
          {beat.title}
        </p>
        <p className="mhl-trans-line mhl-trans-line-2 mx-auto mt-1.5 max-w-[32rem] text-mhl-body text-mhl-muted [text-wrap:pretty]">
          {beat.line}
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
