import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

interface SectionProps {
  /** The plain-language question this section answers, or its plain title. */
  question: string;
  /** Optional one-line lead under the title. */
  lead?: string;
  /** Optional coral disc icon, matching the dashboard's card heads. */
  icon?: ReactNode;
  /** Optional control aligned to the title (e.g. an "Add" button). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** The panel: coral disc, title, optional lead, one quiet control at the right.
    Same head as every card on the dashboard, so a record page reads as part of
    the same composition rather than a different app. */
export function Section({ question, lead, icon, action, children, className }: SectionProps) {
  return (
    <Card as="section" className={cn("min-w-0", className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-mhl-card font-bold tracking-[-0.015em] text-mhl-ink [text-wrap:balance]">
            {question}
          </h2>
          {lead && (
            <p className="mt-0.5 text-mhl-fine text-mhl-muted [text-wrap:pretty]">{lead}</p>
          )}
        </div>
        {action && <div className="flex flex-none items-center">{action}</div>}
      </div>
      {children}
    </Card>
  );
}
