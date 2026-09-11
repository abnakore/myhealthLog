/**
 * App-wide configuration.
 *
 * The API base is read from VITE_API_URL so it can differ between the
 * container (goes through nginx at /api) and a local host run. Fall back
 * to the nginx path — same shape as Family_Tree's API_DOMAIN.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";
