import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AllergySeverity, ConditionStatus, AppointmentStatus } from "@/types/health";

export type TagTone = "neutral" | "ok" | "watch" | "due" | "severe" | "anaphylaxis" | "info";

const TONES: Record<TagTone, string> = {
  neutral: "bg-mhl-sunk text-mhl-muted",
  ok: "bg-mhl-good-lo text-mhl-good",
  watch: "bg-mhl-accent-lo text-mhl-accent",
  due: "bg-mhl-accent text-white",
  info: "bg-mhl-sunk text-mhl-ink",
  severe: "bg-mhl-danger-lo text-mhl-danger font-bold",
  anaphylaxis: "bg-mhl-danger text-white font-bold",
};

interface TagProps {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
}

export function Tag({ tone = "neutral", children, className }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-mhl-fine font-semibold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* Meaning → tone maps, kept next to the component so a list and a form never
   disagree on how a severity looks. Meaning always rides with a text label too;
   these never stand in for words. */

export function allergyTone(severity: AllergySeverity): TagTone {
  switch (severity) {
    case "MILD":
      return "neutral";
    case "MODERATE":
      return "watch";
    case "SEVERE":
      return "severe";
    case "ANAPHYLAXIS":
      return "anaphylaxis";
  }
}

export function conditionTone(status: ConditionStatus): TagTone {
  switch (status) {
    case "ACTIVE":
      return "watch";
    case "IN_REMISSION":
      return "neutral";
    case "RESOLVED":
      return "ok";
  }
}

export function appointmentTone(status: AppointmentStatus): TagTone {
  switch (status) {
    case "SCHEDULED":
      return "watch";
    case "ATTENDED":
      return "ok";
    case "MISSED":
      return "severe";
    case "CANCELLED":
      return "neutral";
  }
}
