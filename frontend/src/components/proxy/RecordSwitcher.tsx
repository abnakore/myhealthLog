/**
 * The "Viewing as" switcher — the entry point to Phase 2's second half.
 *
 * One entry for the person's own record, then every record they hold proxy access to.
 * Choosing one moves the whole app: every Phase 1 page reads the active record from
 * the care-proxy layer, never from the session. A native <select> on purpose — it is
 * keyboard- and screen-reader-native, behaves on a phone without a custom popover, and
 * this is a control people touch rarely. With nothing shared with them it renders
 * nothing at all, rather than a select with one option in it.
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
  const { openable, activeOwnerId, selfId, switchTo } = useCareProxy();
  const id = useId();

  if (openable.length === 0) return null;

  return (
    <div className={cn(variant === "rail" ? "mt-5" : "border-t border-mhl-rule px-4 pb-3 pt-2.5")}>
      <label htmlFor={id} className="text-[0.75rem] font-semibold text-mhl-muted">
        You're viewing
      </label>
      <div className="relative mt-1">
        <select
          id={id}
          value={activeOwnerId}
          onChange={(e) => switchTo(e.target.value)}
          className={cn(
            "w-full appearance-none rounded-mhl-sm border border-mhl-rule bg-mhl-sunk py-2 pl-3 pr-9",
            "text-mhl-fine font-medium text-mhl-ink",
          )}
        >
          <option value={selfId}>My record</option>
          {openable.map((grant) => (
            <option key={grant.id} value={grant.ownerUserId}>
              {grant.ownerName} — {proxyPermissionLabel(grant.permission)}
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
