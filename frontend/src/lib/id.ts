/**
 * Stable id generator for records created client-side (before a backend assigns
 * real ones). Uses crypto.randomUUID where available, with a cheap fallback.
 */
export function genId(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}
