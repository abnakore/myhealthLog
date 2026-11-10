/**
 * ModeSupportBanner — the "Need support?" strip from the pregnancy preview,
 * adapted per mode. Warm tint (no gradient — DESIGN.md), one care-team action.
 */
import { Link } from "react-router-dom";
import type { AppMode } from "@/lib/appModes";
import { HeartIcon } from "@/components/icons";

const COPY: Record<Exclude<AppMode, "standard">, { title: string; sub: string; cta: string }> = {
  pregnancy: {
    title: "Need support?",
    sub: "Have a question about your pregnancy or health?",
    cta: "Contact your care team",
  },
  critical: {
    title: "Need help with your condition?",
    sub: "Your care team knows this record. Reach them any time.",
    cta: "Contact your care team",
  },
  elderly: {
    title: "Need a hand?",
    sub: "A carer or your care team can walk through this with you.",
    cta: "Contact your care team",
  },
};

export function ModeSupportBanner({ mode }: { mode: Exclude<AppMode, "standard"> }) {
  const c = COPY[mode];
  return (
    <section
      aria-label={c.title}
      className="flex min-w-0 flex-col gap-3 rounded-mhl border border-mhl-accent/25 bg-mhl-accent-lo/60 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-4">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-mhl-sm bg-mhl-surface text-mhl-accent">
          <HeartIcon size={22} />
        </span>
        <div className="min-w-0">
          <h2 className="text-mhl-body font-bold text-mhl-ink">{c.title}</h2>
          <p className="text-mhl-fine text-mhl-muted">{c.sub}</p>
        </div>
      </div>
      <Link
        to="/app/providers"
        className="inline-flex flex-none items-center justify-center gap-2 rounded-full border border-mhl-rule bg-mhl-surface px-5 py-2.5 text-mhl-fine font-semibold text-mhl-accent hover:border-mhl-accent/50"
      >
        {c.cta}
      </Link>
    </section>
  );
}
