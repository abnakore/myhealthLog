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
  StethoscopeIcon,
  CopilotIcon,
  CompassIcon,
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
  { to: "/app/copilot", label: "Copilot", icon: CopilotIcon },
  { to: "/app/profile", label: "Profile", icon: UserIcon },
];

/** The one-page read of the whole record, the last door under "Your records".
    Not a category: it composes the shelves above it rather than adding another. */
const SUMMARY_ITEM: NavItem = {
  to: "/app/summary",
  label: "Medical summary",
  icon: StethoscopeIcon,
};

/** Condition-aware profiles: one reading of the record per condition. Kept in
    the rail in every mode so it is always one tap away (Profile links it too). */
const CONTEXTS_ITEM: NavItem = {
  to: "/app/contexts",
  label: "Condition profiles",
  icon: CompassIcon,
};

/** The record categories. Full list in the desktop rail and in the phone's
    Records sheet; the dashboard's summary cards point into them too. */
export const recordNav: NavItem[] = [
  { to: "/app/allergies", label: "Allergies", icon: AllergyIcon },
  { to: "/app/medications", label: "Medications", icon: PillIcon },
  { to: "/app/measurements", label: "Measurements", icon: VitalsIcon },
  { to: "/app/conditions", label: "Conditions", icon: ConditionIcon },
  { to: "/app/appointments", label: "Appointments", icon: CalendarIcon },
  { to: "/app/documents", label: "Documents", icon: DocumentIcon },
  CONTEXTS_ITEM,
  SUMMARY_ITEM,
];

/**
 * A mode reshapes the rail without rewriting the app: same destinations,
 * reordered and renamed around the focus.
 */
export function navForMode(mode: AppMode): { primary: NavItem[]; record: NavItem[] } {
  if (mode === "elderly") {
    return {
      // Home first, then the three plain doors the reference opens with:
      // records, visits, and the emergency card. Medicines stay one tap away
      // on the dashboard's reminders card and the summary tiles.
      primary: [{ to: "/app", label: "Home", icon: HomeIcon, end: true }],
      record: [
        // One plain index that holds every shelf — medicines, allergies, conditions
        // and the rest are one tap from here, not hidden behind a mode switch.
        { to: "/app/records", label: "My Records", icon: RecordsIcon },
        { to: "/app/appointments", label: "Appointments", icon: CalendarIcon },
        { to: "/app/emergency", label: "Emergency", icon: ShieldIcon },
        CONTEXTS_ITEM,
        SUMMARY_ITEM,
      ],
    };
  }
  if (mode === "pregnancy") {
    return {
      primary: primaryNav,
      // The reference's order: the pregnancy profile, then the shelves it leans on.
      record: [
        { to: "/app/contexts", label: "Pregnancy", icon: HeartIcon },
        { to: "/app/medications", label: "Medications", icon: PillIcon },
        { to: "/app/measurements", label: "Measurements", icon: VitalsIcon },
        { to: "/app/conditions", label: "Conditions", icon: ConditionIcon },
        { to: "/app/appointments", label: "Appointments", icon: CalendarIcon },
        { to: "/app/documents", label: "Documents", icon: DocumentIcon },
        SUMMARY_ITEM,
      ],
    };
  }
  if (mode === "critical") {
    // The reference keeps the six shelves as they are in Normal — the focused
    // condition gets its own card at the rail's foot, not a renamed shelf.
    return { primary: primaryNav, record: recordNav };
  }
  return { primary: primaryNav, record: recordNav };
}

