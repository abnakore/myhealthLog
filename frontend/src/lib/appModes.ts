/**
 * Condition-aware profiles — the app's adaptive modes. A mode reshapes what
 * myHealthLog brings forward without changing the underlying record: the same
 * allergies, medications and readings, prioritised differently for the life the
 * person is living right now. This file is the single source of truth for the set
 * of modes and how each describes itself; AppModeContext holds which one is active.
 *
 * Depth is deliberately shallow for now — the mode persists and announces itself,
 * and its `focus` states what it would surface. Per-mode screens come later.
 */
import type { ComponentType } from "react";
import { CompassIcon, SproutIcon, HeartPulseIcon, LifebuoyIcon } from "@/components/icons";

type ModeIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

export type AppMode = "standard" | "pregnancy" | "critical" | "elderly";

export interface AppModeMeta {
  id: AppMode;
  /** Short name, as shown on the switch and the mode pill. */
  label: string;
  /** One line, plain language — what this mode is for. */
  tagline: string;
  /** A sentence on how the app changes shape in this mode. */
  blurb: string;
  /** What the mode pulls to the front — descriptive, shown as chips and bullets. */
  focus: string[];
  Icon: ModeIcon;
}

export const APP_MODES: AppModeMeta[] = [
  {
    id: "standard",
    label: "Standard",
    tagline: "Your everyday health record.",
    blurb: "Everything in one place, with nothing pushed ahead of anything else.",
    focus: ["The complete record", "Every record type", "A balanced overview"],
    Icon: CompassIcon,
  },
  {
    id: "pregnancy",
    label: "Pregnancy",
    tagline: "Tuned for the months of a pregnancy.",
    blurb: "Brings antenatal visits, weight and blood pressure, and the dates that matter to the front.",
    focus: ["Antenatal appointments", "Weight & blood pressure", "Scan & due dates"],
    Icon: SproutIcon,
  },
  {
    id: "critical",
    label: "Critical illness",
    tagline: "For managing a serious, active condition.",
    blurb: "Keeps the condition, its treatment, and the readings your team watches one tap away — and primes your emergency card.",
    focus: ["The active condition first", "Treatment & schedule", "The numbers that matter"],
    Icon: HeartPulseIcon,
  },
  {
    id: "elderly",
    label: "Elderly care",
    tagline: "Simpler, with the essentials larger.",
    blurb: "Fewer choices and bigger touch targets, with daily medication reminders a carer can help with.",
    focus: ["Daily medication reminders", "Larger, simpler screens", "Carer-friendly sharing"],
    Icon: LifebuoyIcon,
  },
];

export const DEFAULT_MODE: AppMode = "standard";

/** The metadata for a mode, falling back to Standard if the stored value is unknown. */
export function appModeMeta(id: AppMode): AppModeMeta {
  return APP_MODES.find((m) => m.id === id) ?? APP_MODES[0];
}
