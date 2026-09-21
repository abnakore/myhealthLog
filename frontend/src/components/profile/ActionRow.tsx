import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { ChevronRightIcon } from "@/components/icons";

interface ActionRowProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  /** Navigate on click… */
  to?: string;
  /** …or run a handler (e.g. open a modal). One of `to` / `onClick`. */
  onClick?: () => void;
  /** Right-hand slot — a status tag, say. Defaults to a chevron. */
  trailing?: ReactNode;
  className?: string;
}

/** A settings-style row: icon, title, one-line subtitle, chevron. Used for the
    profile's actions hub — sharing, safety, data. Borderless on purpose so a run of
    rows inside one Section card never reads as cards stacked in a card. */
export function ActionRow({ icon, title, subtitle, to, onClick, trailing, className }: ActionRowProps) {
  const inner = (
    <>
      <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-mhl-body font-semibold text-mhl-ink">{title}</span>
        {subtitle && <span className="block truncate text-mhl-fine text-mhl-muted">{subtitle}</span>}
      </span>
      <span className="flex-none text-mhl-faint transition-transform duration-200 ease-mhl group-hover:translate-x-0.5">
        {trailing ?? <ChevronRightIcon size={18} />}
      </span>
    </>
  );

  const classes = cn(
    "group flex w-full items-center gap-3.5 rounded-mhl-sm px-3 py-3 text-left transition-colors hover:bg-mhl-sunk",
    className,
  );

  if (to) {
    return (
      <Link to={to} className={classes}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {inner}
    </button>
  );
}
