import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** An invitation, not an apology. Sits on a soft well; leads with what this is and
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
        "flex flex-col items-center rounded-mhl-sm bg-mhl-sunk px-5 py-9 text-center",
        className,
      )}
    >
      {icon && (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-mhl-surface text-mhl-accent shadow-mhl">
          {icon}
        </span>
      )}
      <p className="text-mhl-card font-bold text-mhl-ink">{title}</p>
      {description && (
        <p className="mt-1 max-w-[34ch] text-mhl-fine text-mhl-muted [text-wrap:pretty]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
