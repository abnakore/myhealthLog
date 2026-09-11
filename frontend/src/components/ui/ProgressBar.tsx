import { cn } from "@/lib/cn";

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  className?: string;
  label?: string;
}

export function ProgressBar({ value, className, label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-mhl-sunk", className)}
    >
      <span
        className="block h-full rounded-full bg-mhl-accent transition-[width] duration-700 ease-mhl"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
