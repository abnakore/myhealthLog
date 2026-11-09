/**
 * A link back to the complete record, for the foot of a profile page.
 *
 * The old "Viewing X profile · your full record is unchanged" strip that sat above
 * every screen is gone: the home screen states its mode in the rail and in its own
 * hero, and every other page carries the one-tap mode banner. This is the single
 * way-back control a profile page still needs.
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useContexts } from "@/store/ContextsContext";
import { ChevronRightIcon } from "@/components/icons";

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
