import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

/** The title that opens every app screen: one bold sentence-case line, one plain
    sub-line, and the page's single coral action on the right. The same type scale,
    weight and rhythm as the dashboard's greeting. */
export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-mhl-h1 font-bold tracking-[-0.024em] text-mhl-ink [text-wrap:balance]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-mhl-body text-mhl-muted [text-wrap:pretty]">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex flex-none items-center gap-2">{action}</div>}
    </header>
  );
}
