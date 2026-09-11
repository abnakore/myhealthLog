import type { ReactNode } from "react";
import { PlusIcon } from "@/components/icons";

/** The frame for the signed-out screens (login, register, Google hand-off). A calm,
    centred single column on the warm sand — no marketing split, no gradients. */
export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-mhl-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-[0.65rem] bg-mhl-accent text-white">
            <PlusIcon size={20} strokeWidth={2.5} />
          </span>
          <span className="text-mhl-title font-bold tracking-[-0.02em] text-mhl-ink">
            myHealthLog
          </span>
        </div>

        <h1 className="text-mhl-answer font-bold text-mhl-ink">{title}</h1>
        {intro && <p className="mt-2 text-mhl-body text-mhl-muted">{intro}</p>}

        <div className="mt-7">{children}</div>

        {footer && <div className="mt-6 text-mhl-body text-mhl-muted">{footer}</div>}
      </div>
    </div>
  );
}

/** The "or" rule between password sign-in and the Google button. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-mhl-fine text-mhl-faint">
      <span className="h-px flex-1 bg-mhl-rule" />
      or
      <span className="h-px flex-1 bg-mhl-rule" />
    </div>
  );
}
