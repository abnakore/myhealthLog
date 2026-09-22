/**
 * App-wide configuration.
 *
 * The API base is read from VITE_API_URL so it can differ between the
 * container (goes through nginx at /api) and a local host run. Fall back
 * to the nginx path — same shape as Family_Tree's API_DOMAIN.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

/**
 * The origin absolute links should point at — currently only the emergency URL a
 * responder scans off a printed card. Left unset it falls back to the origin the app
 * is being served from, which is right for a phone scanning a card printed at home;
 * set VITE_PUBLIC_ORIGIN (a LAN address, or the deployed domain) when the card will
 * be scanned somewhere other than the machine that printed it.
 */
export const PUBLIC_ORIGIN: string | undefined =
  (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim().replace(/\/+$/, "") ||
  undefined;

