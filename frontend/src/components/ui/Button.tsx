import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-mhl-accent text-white hover:bg-mhl-accent-strong",
  secondary:
    "bg-mhl-surface text-mhl-ink border border-mhl-rule hover:border-mhl-faint",
  ghost: "text-mhl-ink hover:bg-mhl-sunk",
  danger: "bg-mhl-danger text-white hover:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-5 text-mhl-body",
  lg: "min-h-12 px-6 text-mhl-lead",
};

/** Shared class string, so a react-router <Link> can look like a button too. */
export function buttonStyles(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  block = false,
): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold",
    "transition-[background-color,border-color,filter] duration-150 ease-mhl select-none",
    "disabled:opacity-55 disabled:pointer-events-none",
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  icon,
  disabled,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonStyles(variant, size, block), className)}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : icon}
      {children}
    </button>
  );
}
