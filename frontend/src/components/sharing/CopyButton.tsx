import { useState } from "react";
import { cn } from "@/lib/cn";
import { CopyIcon, CheckIcon } from "@/components/icons";

interface CopyButtonProps {
  value: string;
  /** Button text and accessible name. */
  label?: string;
  className?: string;
}

/** Copies a short string (a code, a PIN, a token) to the clipboard and confirms in
    place for a moment. No-ops quietly where the clipboard API is blocked. */
export function CopyButton({ value, label = "Copy", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label}, copied` : label}
      className={cn(
        "inline-flex items-center gap-1.5 text-mhl-fine font-semibold text-mhl-accent transition-colors hover:text-mhl-accent-strong",
        className,
      )}
    >
      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      {copied ? "Copied" : label}
    </button>
  );
}
