/**
 * Join class names, dropping falsy values so conditionals read cleanly:
 *   cn("btn", isActive && "btn--on", size === "lg" && "btn--lg")
 *
 * Deliberately tiny — no clsx / tailwind-merge dependency. Compose classes so
 * they don't fight; don't rely on later utilities overriding earlier ones.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
