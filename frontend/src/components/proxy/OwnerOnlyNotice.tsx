/**
 * The block a proxy sees where the record owner's own controls would be: the pages
 * only the owner may act on (sharing, emergency access, connections) and the Add flow
 * when their access is view only.
 *
 * It names whose record this is and puts the way back one tap away, instead of
 * showing controls that would fail or, worse, controls that would silently work on
 * someone else's record.
 */
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LockIcon } from "@/components/icons";
import { useCareProxy } from "@/store/CareProxyContext";

interface OwnerOnlyNoticeProps {
  title: string;
  description: string;
}

export function OwnerOnlyNotice({ title, description }: OwnerOnlyNoticeProps) {
  const { selfId, switchTo } = useCareProxy();
  return (
    <EmptyState
      icon={<LockIcon size={26} />}
      title={title}
      description={description}
      action={
        <Button variant="secondary" onClick={() => switchTo(selfId)}>
          Back to my record
        </Button>
      }
    />
  );
}
