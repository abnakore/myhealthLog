/**
 * Inline icon set — stroke-based, currentColor, no dependency. A small, hand-picked
 * set (nav, record types, actions) rather than a full library, so the visual weight
 * matches the rest of the UI and nothing ships unused.
 *
 * All icons share one 24×24 grid and inherit color + stroke from `currentColor`.
 * They're decorative by default (aria-hidden); when an icon is the only label for a
 * control, give the control itself an aria-label.
 */
import type { ReactNode, SVGProps } from "react";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  strokeWidth?: number;
}

function Base({ size = 20, strokeWidth = 1.75, ...rest }: IconProps & { children: ReactNode }) {
  const { children, ...svg } = rest as IconProps & { children: ReactNode };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...svg}
    >
      {children}
    </svg>
  );
}

/* ---- navigation ---- */

export const HomeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 11.5 12 5l8 6.5" />
    <path d="M6 10.5V20h12v-9.5" />
  </Base>
);

/** Left-pointing chevron/arrow, for "go back to the list". */
export const ArrowLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </Base>
);

/** Open eye, for "view this record". */
export const EyeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
);

export const RecordsIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2.5" />
    <rect x="9" y="2.5" width="6" height="4" rx="1.3" />
    <path d="M9 12h6M9 16h4" />
  </Base>
);

export const TimelineIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 12h3.5l2.5 7 4-14 2.5 7H21" />
  </Base>
);

export const UserIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Base>
);

/* ---- record types ---- */

export const PillIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="8" width="18" height="8" rx="4" />
    <path d="M12 8v8" />
  </Base>
);

export const AllergyIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v4" />
    <path d="M12 17.3h.01" />
  </Base>
);

export const ConditionIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 20s-6.5-4.35-9-8.5C1.5 8.5 3 5 6.5 5 9 5 12 7.5 12 7.5S15 5 17.5 5C21 5 22.5 8.5 21 11.5 18.5 15.65 12 20 12 20Z" />
  </Base>
);

export const CalendarIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="5" width="16" height="16" rx="2.5" />
    <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
  </Base>
);

export const DocumentIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M13.5 3.2V7.5H18M9 13h6M9 16.5h6" />
  </Base>
);

export const ScanIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M4 12h16" />
  </Base>
);

export const VaccineIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 5 6v6c0 4.5 3.2 7.3 7 8.5 3.8-1.2 7-4 7-8.5V6l-7-2.5Z" />
    <path d="m9 12 2 2 4-4" />
  </Base>
);

export const VitalsIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M6 12h2.5l1.5-3 2 6 1.5-3H18" />
  </Base>
);

/* ---- actions ---- */

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const DownloadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4v11M8 11l4 4 4-4" />
    <path d="M5 19h14" />
  </Base>
);

export const ShareIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
  </Base>
);

export const EditIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" />
    <path d="m14 7 3 3" />
  </Base>
);

export const TrashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
  </Base>
);

export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Base>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m15 6-6 6 6 6" />
  </Base>
);

export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Base>
);

export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Base>
);

export const PhoneIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.5 4h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 6a2 2 0 0 1 2-2Z" />
  </Base>
);

export const MapPinIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Base>
);

export const ShieldIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 5 6v6c0 4.5 3.2 7.3 7 8.5 3.8-1.2 7-4 7-8.5V6l-7-2.5Z" />
  </Base>
);

export const QrIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1" />
    <rect x="13" y="4" width="7" height="7" rx="1" />
    <rect x="4" y="13" width="7" height="7" rx="1" />
    <path d="M14.5 14.5h1.5v1.5M20 14.5v1.5h-1.5M14.5 20v-1.5M18.5 20H20" />
  </Base>
);

export const CameraIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <circle cx="12" cy="13.5" r="3.5" />
    <path d="M8 7l1.5-2.5h5L16 7" />
  </Base>
);

export const InfoIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 11v5M12 8h.01" />
  </Base>
);

export const LogoutIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9" />
    <path d="m18 15 3-3-3-3M21 12H10" />
  </Base>
);

export const UploadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 16V5M8 9l4-4 4 4" />
    <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
  </Base>
);

export const SlidersIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 8h9M17 8h3" />
    <circle cx="15" cy="8" r="2" />
    <path d="M4 16h3M11 16h9" />
    <circle cx="9" cy="16" r="2" />
  </Base>
);

/* ---- sharing & safety ---- */

export const StethoscopeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 4v6a4 4 0 0 0 8 0V4" />
    <path d="M9 14a5 5 0 0 0 5 5h.5a3.5 3.5 0 0 0 3.5-3.5V15" />
    <circle cx="18.5" cy="12.8" r="2.3" />
  </Base>
);

export const UsersIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.3" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16.5 5.3a3.3 3.3 0 0 1 0 5.4" />
    <path d="M15.8 14.7a5.5 5.5 0 0 1 4.7 5.3" />
  </Base>
);

export const LinkIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 14a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 0 1 5 5l-1 1" />
    <path d="M14 10a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 0 1-5-5l1-1" />
  </Base>
);

export const KeyIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="8" cy="15.5" r="3.5" />
    <path d="M10.5 13 20 3.5" />
    <path d="M15 8.5l2.5 2.5M17.5 6l2 2" />
  </Base>
);

export const CopyIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2" />
    <path d="M16 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5" />
  </Base>
);

export const RefreshIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 0 0-14-5L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14 5l2-2" />
    <path d="M20 20v-4h-4" />
  </Base>
);

export const LockIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.3" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Base>
);

export const MailIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
  </Base>
);

export const SunIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" />
  </Base>
);

export const MoonIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
  </Base>
);

/* ---- dashboard — small UI + measure marks (stroke, currentColor) ---- */

export const BellIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5A5.5 5.5 0 0 0 6.5 9v3.2L5 15.5h14L17.5 12.2V9A5.5 5.5 0 0 0 12 3.5Z" />
    <path d="M9.9 18.5a2.2 2.2 0 0 0 4.2 0" />
  </Base>
);

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.4V12l3.1 2" />
  </Base>
);

export const DropIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5c3 3.4 5.5 6.2 5.5 9.2a5.5 5.5 0 0 1-11 0c0-3 2.5-5.8 5.5-9.2Z" />
  </Base>
);

export const LeafIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M19.5 4.3c0 8.2-4.4 12.8-11.2 12.8a8.4 8.4 0 0 1-3.8-.8c.1-7.7 5.4-12 15-12Z" />
    <path d="M4.8 19.5c2.4-5.4 6.3-8.9 11.2-10.9" />
  </Base>
);

export const HeartIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 19.5C12 19.5 4.5 15 4.5 9.9A3.9 3.9 0 0 1 12 7.7a3.9 3.9 0 0 1 7.5 2.2c0 5.1-7.5 9.6-7.5 9.6Z" />
  </Base>
);

export const WeightIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
    <path d="m8 14.2 2.6-2.7 2.1 2.1 3.3-3.4" />
  </Base>
);

export const FlowerIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="2.4" />
    <path d="M12 3.2v3.4M12 17.4v3.4M4.5 7.6l3 1.7M16.5 14.7l3 1.7M4.5 16.4l3-1.7M16.5 9.3l3-1.7" />
  </Base>
);

/* ---- condition-aware modes ---- */

export const CompassIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" />
  </Base>
);

export const SproutIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 21v-9" />
    <path d="M12 12c0-3.4 2.7-5.4 6.4-5.4 0 3.4-2.7 5.4-6.4 5.4Z" />
    <path d="M12 14.5c0-2.7-2.2-4.4-5.2-4.4 0 2.7 2.2 4.4 5.2 4.4Z" />
  </Base>
);

export const HeartPulseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 20s-6.5-4.35-9-8.5C1.5 8.5 3 5 6.5 5 9 5 12 7.5 12 7.5S15 5 17.5 5C21 5 22.5 8.5 21 11.5 18.5 15.65 12 20 12 20Z" />
    <path d="M6.5 12.3h2.4l1.4-2.6 2 4.6 1.3-2h3.9" />
  </Base>
);

export const LifebuoyIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.6" />
    <path d="m14.6 9.4 3.8-3.8M9.4 9.4 5.6 5.6M14.6 14.6l3.8 3.8M9.4 14.6l-3.8 3.8" />
  </Base>
);

/** The four-color Google mark for "Continue with Google" (fills, not stroke). */
export const GoogleIcon = ({ size = 18, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" {...rest}>
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);
