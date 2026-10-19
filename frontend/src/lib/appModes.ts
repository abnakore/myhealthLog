/**
 * Condition-aware profiles — the app's adaptive modes. A mode reshapes what
 * myHealthLog brings forward without changing the underlying record: the same
 * allergies, medications and readings, prioritised differently for the life the
 * person is living right now. This file is the single source of truth for the set
 * of modes and how each describes itself; AppModeContext holds which one is active
 * (remembered per person, like the active profile).
 *
 * The four modes:
 *  • normal   — the complete record, balanced, nothing pushed forward.
 *  • pregnancy — antenatal visits, weight & blood pressure, scans & due dates.
 *  • critical — one chosen condition leads: its treatment, schedule and numbers.
 *  • elderly  — fewer choices, larger text, medication reminders take the stage.
 */

import type { ComponentType } from "react";
import { CompassIcon, SproutIcon, HeartPulseIcon, LifebuoyIcon } from "@/components/icons";

type ModeIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

export type AppMode = "standard" | "pregnancy" | "critical" | "elderly";

export interface AppModeMeta {
  id: AppMode;
  /** Short name, as shown on the switch and the mode pill. */
  label: string;
  /** The pill text in the rail, e.g. "Pregnancy mode". */
  pill: string;
  /** One line, plain language — what this mode is for. */
  tagline: string;
  /** A sentence on how the app changes shape in this mode. */
  blurb: string;
  /** Greeting sub-line on the dashboard. */
  greeting: string;
  /** What the mode pulls to the front — descriptive, shown as chips and bullets. */
  focus: string[];
  Icon: ModeIcon;
}

export const APP_MODES: AppModeMeta[] = [
  {
    id: "standard",
    label: "Normal",
    pill: "Normal mode",
    tagline: "Your everyday health record.",
    blurb: "Everything in one place, with nothing pushed ahead of anything else.",
    greeting: "Here's where your health record stands today.",
    focus: ["The complete record", "Every record type", "A balanced overview"],
    Icon: CompassIcon,
  },
  {
    id: "pregnancy",
    label: "Pregnancy",
    pill: "Pregnancy mode",
    tagline: "Your pregnancy journey is our focus.",
    blurb: "Brings antenatal visits, weight and blood pressure, and the dates that matter to the front.",
    greeting: "Here's your pregnancy overview.",
    focus: ["Antenatal appointments", "Weight & blood pressure", "Scan & due dates"],
    Icon: SproutIcon,
  },
  {
    id: "critical",
    label: "Critical condition",
    pill: "Critical condition",
    tagline: "Focused on your selected condition.",
    blurb: "Keeps the condition, its treatment, and the readings your team watches one tap away — and primes your emergency card.",
    greeting: "Here's what matters most right now.",
    focus: ["The active condition first", "Treatment & schedule", "The numbers that matter"],
    Icon: HeartPulseIcon,
  },
  {
    id: "elderly",
    label: "Elderly",
    pill: "Elderly mode",
    tagline: "Simpler. Clearer. Safer.",
    blurb: "Fewer choices and bigger touch targets, with daily medication reminders a carer can help with.",
    greeting: "Here's your health overview, made simple and easy to follow.",
    focus: ["Daily medication reminders", "Larger, simpler screens", "Carer-friendly sharing"],
    Icon: LifebuoyIcon,
  },
];

export const DEFAULT_MODE: AppMode = "standard";

/** The metadata for a mode, falling back to Normal if the stored value is unknown. */
export function appModeMeta(id: AppMode): AppModeMeta {
  return APP_MODES.find((m) => m.id === id) ?? APP_MODES[0];
}

/** Narrow an unknown stored value to a real mode. */
export function asAppMode(value: unknown): AppMode {
  return value === "pregnancy" || value === "critical" || value === "elderly" ? value : "standard";
}

