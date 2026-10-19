import type { ComponentType } from "react";
import {
  HomeIcon,
  TimelineIcon,
  UserIcon,
  PillIcon,
  AllergyIcon,
  ConditionIcon,
  CalendarIcon,
  DocumentIcon,
  VitalsIcon,
  ShieldIcon,
  RecordsIcon,
  HeartIcon,
} from "@/components/icons";
import type { AppMode } from "@/lib/appModes";

type IconType = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

export interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  /** Exact-match the route (for the index "/app"). */
  end?: boolean;
}

/** Shown in the mobile tab bar and at the top of the desktop rail. */
export const primaryNav: NavItem[] = [
  { to: "/app", label: "Home", icon: HomeIcon, end: true },
  { to: "/app/timeline", label: "Timeline", icon: TimelineIcon },
  { to: "/app/profile", label: "Profile", icon: UserIcon },
];

/** The record categories. Full list in the desktop rail; on mobile these are
    reached from the dashboard's summary cards and the Add flow. */
export const recordNav: NavItem[] = [
  { to: "/app/allergies", label: "Allergies", icon: AllergyIcon },
  { to: "/app/medications", label: "Medications", icon: PillIcon },
  { to: "/app/measurements", label: "Measurements", icon: VitalsIcon },
  { to: "/app/conditions", label: "Conditions", icon: ConditionIcon },
  { to: "/app/appointments", label: "Appointments", icon: CalendarIcon },
  { to: "/app/documents", label: "Documents", icon: DocumentIcon },
];

/**
 * A mode reshapes the rail without rewriting the app: same destinations,
 * reordered and renamed around the focus.
 */
export function navForMode(mode: AppMode, criticalLabel?: string): { primary: NavItem[]; record: NavItem[] } {
  if (mode === "elderly") {
    return {
      // Home first, then the three things that matter most: medicines,
      // visits, and the emergency card. Everything else stays one tap away
      // on the dashboard's "what else" card and the full record pages.
      primary: [{ to: "/app", label: "Home", icon: HomeIcon, end: true }],
      record: [
        { to: "/app/medications", label: "Medicines", icon: PillIcon },
        { to: "/app/appointments", label: "Appointments", icon: CalendarIcon },
        { to: "/app/timeline", label: "My Records", icon: RecordsIcon },
        { to: "/app/emergency", label: "Emergency", icon: ShieldIcon },
      ],
    };
  }
  if (mode === "pregnancy") {
    return {
      primary: primaryNav,
      record: [
        { to: "/app/contexts", label: "Pregnancy", icon: HeartIcon },
        { to: "/app/appointments", label: "Appointments", icon: CalendarIcon },
        { to: "/app/measurements", label: "Measurements", icon: VitalsIcon },
        { to: "/app/medications", label: "Medications", icon: PillIcon },
        { to: "/app/documents", label: "Documents", icon: DocumentIcon },
        { to: "/app/conditions", label: "Conditions", icon: ConditionIcon },
      ],
    };
  }
  if (mode === "critical") {
    return {
      primary: primaryNav,
      record: [
        { to: "/app/contexts", label: criticalLabel || "Focus", icon: HeartIcon },
        { to: "/app/medications", label: "Medications", icon: PillIcon },
        { to: "/app/measurements", label: "Measurements", icon: VitalsIcon },
        { to: "/app/appointments", label: "Appointments", icon: CalendarIcon },
        { to: "/app/documents", label: "Documents", icon: DocumentIcon },
        { to: "/app/conditions", label: "Conditions", icon: ConditionIcon },
      ],
    };
  }
  return { primary: primaryNav, record: recordNav };
}

