import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — the button's only content is an icon, so it needs an accessible name. */
  label: string;
  tone?: "default" | "danger";
}

/** A 36px round icon-only control for row actions (edit, delete). The label becomes
    both the accessible name and the hover tooltip. */
export function IconButton({ label, tone = "default", className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 w-9 flex-none place-items-center rounded-full transition-colors",
        tone === "danger"
          ? "text-mhl-muted hover:bg-mhl-danger-lo hover:text-mhl-danger"
          : "text-mhl-muted hover:bg-mhl-sunk hover:text-mhl-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
