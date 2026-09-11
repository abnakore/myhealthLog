import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

/** The warm, plain-language page title that opens every app screen. A real heading
    and a human sentence — not a tracked-out eyebrow label. */
export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-mhl-answer font-bold text-mhl-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-mhl-body text-mhl-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </header>
  );
}
