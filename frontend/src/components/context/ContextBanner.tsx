/**
 * The one thing that must be true on every screen once a profile is open: the user
 * should read this as a *lens*, not as a changed record.
 *
 * So the band states what is being viewed and where the rest of the record is, in the
 * same breath — "Viewing Asthma profile · your full record is unchanged" — and carries
 * the way back. It sits in the app shell, above the page, because that is where the
 * care-proxy banner already lives for the same reason.
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useContexts } from "@/store/ContextsContext";
import { isPregnancy } from "@/lib/healthContexts";
import { ChevronRightIcon, CompassIcon, ConditionIcon, SproutIcon } from "@/components/icons";

export function ContextBanner() {
  const { active, activeLabel, deactivate } = useContexts();
  if (!active) return null;

  const Icon = isPregnancy(active) ? SproutIcon : ConditionIcon;

  return (
    <div className="border-b border-mhl-accent/25 bg-mhl-accent-lo">
      <div className="mx-auto flex w-full max-w-[42rem] items-center gap-2 px-4 py-2 lg:px-8">
        <span className="flex-none text-mhl-accent">
          <Icon size={17} />
        </span>
        <p className="min-w-0 flex-1 truncate text-mhl-fine text-mhl-ink">
          Viewing <span className="font-bold">{activeLabel}</span> profile
          <span className="text-mhl-muted"> · your full record is unchanged</span>
        </p>
        <Link
          to="/app/contexts"
          className="flex-none rounded-full px-2.5 py-1 text-mhl-fine font-semibold text-mhl-accent hover:bg-mhl-accent/10"
        >
          Switch
        </Link>
        <button
          type="button"
          onClick={deactivate}
          className={cn(
            "flex flex-none items-center gap-0.5 rounded-full px-2.5 py-1 text-mhl-fine font-semibold",
            "text-mhl-accent hover:bg-mhl-accent/10",
          )}
        >
          <CompassIcon size={14} />
          All health records
        </button>
      </div>
    </div>
  );
}

/** A link back to the complete record, for the foot of a profile page. */
export function AllRecordsLink({ className }: { className?: string }) {
  const { deactivate } = useContexts();
  return (
    <Link
      to="/app"
      onClick={deactivate}
      className={cn("inline-flex items-center gap-1 font-semibold text-mhl-accent hover:text-mhl-accent-strong", className)}
    >
      All health records
      <ChevronRightIcon size={14} />
    </Link>
  );
}
