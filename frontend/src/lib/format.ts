/**
 * Date / number formatting. Deliberately dependency-free and locale-stable:
 * dates are built from an explicit month table rather than Intl, so a clinic
 * date reads the same ("14 Sep 2026") on every device and never shifts a day
 * across timezones. Date-only strings (YYYY-MM-DD) are parsed as local dates.
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // Parse date-only strings as local midnight to avoid UTC off-by-one.
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "14 Sep 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "Not set";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "14 Sep" — year dropped; for recent/this-year items. */
export function formatShortDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "Not set";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "9:00" (24h, no leading zero on the hour). */
export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "Not set";
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "14 Sep, 9:00" */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "Not set";
  return `${formatShortDate(d)}, ${formatTime(d)}`;
}

/** Just the year, e.g. for "Since 2024". */
export function yearOf(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? String(d.getFullYear()) : "Not set";
}

/** Whole years between a date of birth and now. */
export function calcAge(dob: string | Date | null | undefined): number | null {
  const d = toDate(dob);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

/** "just now", "4 min ago", "2 hr ago", "3 days ago", else a date. */
export function formatRelative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "Not set";
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 0) return formatDate(d);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(d);
}

/** "214 KB", "1.1 MB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Up to two initials from a name, for the avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
