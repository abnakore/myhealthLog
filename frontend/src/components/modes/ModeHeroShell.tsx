/**
 * Shared hero shell + portrait art for the four mode dashboards.
 * CSS-only art (no image payload on the critical path).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function HeroShell({
  eyebrow,
  children,
  art,
  className,
}: {
  eyebrow: string;
  children: ReactNode;
  art: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={eyebrow}
      className={cn(
        "mhl-mode-hero grid min-w-0 gap-5 overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface p-5 sm:p-6 lg:grid-cols-[1.35fr_1fr] lg:items-stretch",
        className,
      )}
    >
      <div className="min-w-0">{children}</div>
      <div className="relative hidden min-h-[13rem] overflow-hidden rounded-mhl-sm lg:block">{art}</div>
    </section>
  );
}

export function HeroEyebrow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-2 text-mhl-fine font-bold uppercase tracking-[0.08em] text-mhl-accent">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
        {icon}
      </span>
      {text}
    </p>
  );
}

export function PortraitArt({
  headline,
  sub,
  variant,
}: {
  headline: string;
  sub: string;
  variant: "pregnancy" | "critical" | "elderly" | "normal";
}) {
  const hues: Record<string, string> = {
    pregnancy: "oklch(0.72 0.12 45)",
    critical: "oklch(0.62 0.10 30)",
    elderly: "oklch(0.68 0.08 150)",
    normal: "oklch(0.70 0.09 70)",
  };
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        background: `radial-gradient(120% 90% at 20% 10%, ${hues[variant]} 0%, transparent 55%), radial-gradient(100% 100% at 85% 90%, oklch(0.88 0.05 80) 0%, transparent 60%), linear-gradient(160deg, oklch(0.96 0.03 70), oklch(0.90 0.04 60))`,
      }}
    >
      <div className="absolute inset-x-5 bottom-5 rounded-mhl-sm bg-mhl-surface/85 p-4 backdrop-blur-sm">
        <p
          className="text-mhl-lead font-semibold leading-snug text-mhl-ink"
          style={{ fontFamily: "Georgia,'Times New Roman',serif" }}
        >
          {headline}
        </p>
        <p className="mt-1 text-mhl-fine text-mhl-muted">{sub}</p>
      </div>
      <div
        className="absolute -right-8 -top-8 h-36 w-36 rounded-full opacity-40"
        style={{ background: hues[variant] }}
      />
      <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-mhl-surface/60" />
    </div>
  );
}
