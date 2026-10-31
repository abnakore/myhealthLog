import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Render as a different element (e.g. "section", "article") while keeping styling. */
  as?: ElementType;
}

/** A plain surface container: near-white, hairline rule, soft radius, one step of
    tinted lift. The base for sections, panels and sheets. Nest at most one well
    (`bg-mhl-sunk`) inside. */
export function Card({ as: Tag = "div", className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-mhl border border-mhl-rule bg-mhl-surface p-5 shadow-mhl",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
