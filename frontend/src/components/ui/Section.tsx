import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

interface SectionProps {
  /** The plain-language question this section answers — direction 08's signature. */
  question: string;
  /** Optional one-line lead under the question. */
  lead?: string;
  /** Optional control aligned to the question (e.g. an "Add" button). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** The question-headed card. Every content section on a record page leads with the
    question it answers, in the user's words. */
export function Section({ question, lead, action, children, className }: SectionProps) {
  return (
    <Card as="section" className={cn("min-w-0", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-mhl-lead">{question}</h3>
          {lead && <p className="mt-0.5 text-mhl-fine text-mhl-muted">{lead}</p>}
        </div>
        {action && <div className="flex-none">{action}</div>}
      </div>
      {children}
    </Card>
  );
}
