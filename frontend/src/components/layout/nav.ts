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
} from "@/components/icons";

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
