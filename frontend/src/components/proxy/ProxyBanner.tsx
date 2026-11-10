/**
 * The "you are not looking at your own record" bar.
 *
 * It sits above every page for as long as the context is switched, names the record
 * and says the level out loud, and offers the way back — because a proxy who has
 * forgotten whose record they're in is the failure mode this feature has to design
 * against, not a typo to be tidied up later.
 */
import { LockIcon } from "@/components/icons";
import { useCareProxy } from "@/store/CareProxyContext";
import { proxyPermissionLabel } from "@/types/proxy";

export function ProxyBanner() {
  const { isProxyView, activeOwnerName, permission, selfId, switchTo } = useCareProxy();
  if (!isProxyView) return null;

  return (
    <div className="border-b border-mhl-rule bg-mhl-accent-lo">
      <div className="mx-auto flex w-full max-w-[42rem] items-center gap-3 px-4 py-2.5 lg:px-8">
        <span className="flex-none text-mhl-accent">
          <LockIcon size={18} />
        </span>
        <p className="min-w-0 flex-1 text-mhl-fine text-mhl-ink">
          Viewing <span className="font-bold">{activeOwnerName}</span>'s record.{" "}
          {proxyPermissionLabel(permission)}
        </p>
        <button
          type="button"
          onClick={() => switchTo(selfId)}
          className="flex-none rounded-full px-2 py-1 text-mhl-fine font-semibold text-mhl-accent transition-colors hover:text-mhl-accent-strong"
        >
          Switch back
        </button>
      </div>
    </div>
  );
}
