import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** An invitation, not an apology. Sits on a sunk well; leads with what this is and
    the one action that fills it. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-mhl-sm bg-mhl-sunk px-5 py-8 text-center",
        className,
      )}
    >
      {icon && <div className="mb-3 text-mhl-faint">{icon}</div>}
      <p className="text-mhl-body font-semibold text-mhl-ink">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-mhl-fine text-mhl-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
