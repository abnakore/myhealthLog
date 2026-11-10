/**
 * The "You're viewing" switcher — the entry point to a relative's record.
 *
 * One entry for the person's own record, then every record they hold proxy access to.
 * Choosing one moves the whole app: every page reads the active record from the
 * care-proxy layer, never from the session. A native <select> on purpose — it is
 * keyboard- and screen-reader-native, behaves on a phone without a custom popover, and
 * this is a control people touch rarely. With nothing shared with them it renders
 * nothing at all: the rail stays the plain map of one record.
 */
import { useId } from "react";
import { cn } from "@/lib/cn";
import { useCareProxy } from "@/store/CareProxyContext";
import { proxyPermissionLabel } from "@/types/proxy";

interface RecordSwitcherProps {
  /** "rail" sits in the desktop sidebar; "bar" fills the mobile header row. */
  variant?: "rail" | "bar";
}

export function RecordSwitcher({ variant = "rail" }: RecordSwitcherProps) {
  const { openable, activeOwnerId, selfId, switchTo, isProxyView } = useCareProxy();
  const id = useId();

  // The list always contains your own record; a switcher only earns its space
  // when there is at least one other to switch into. In your own record it stays
  // out of the rail entirely: stepping into a relative's record is something you
  // do deliberately, from Care proxy, not a control that follows you everywhere.
  const others = openable.filter((grant) => grant.ownerUserId !== selfId);
  if (!isProxyView || others.length === 0) return null;

  return (
    <div
      className={cn(
        variant === "rail" ? "mt-6" : "border-t border-mhl-rule px-4 pb-3 pt-2.5",
      )}
    >
      <label
        htmlFor={id}
        className={cn(
          "font-medium text-mhl-faint",
          variant === "rail" ? "px-3 text-[0.86rem]" : "text-[0.78rem]",
        )}
      >
        You're viewing
      </label>
      <div className={cn("relative", variant === "rail" ? "mt-1.5 px-1" : "mt-1")}>
        <select
          id={id}
          value={activeOwnerId}
          onChange={(e) => switchTo(e.target.value)}
          className={cn(
            "w-full appearance-none rounded-[0.7rem] border border-mhl-rule bg-mhl-surface py-2 pl-3 pr-9",
            "text-mhl-fine font-semibold text-mhl-ink transition-colors hover:border-mhl-accent/40",
          )}
        >
          <option value={selfId}>My record</option>
          {others.map((grant) => (
            <option key={grant.id} value={grant.ownerUserId}>
              {grant.ownerName} · {proxyPermissionLabel(grant.permission)}
            </option>
          ))}
        </select>
        <Caret />
      </div>
    </div>
  );
}

/** The same caret the field components draw, so a select reads as a select. */
function Caret() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mhl-muted"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
