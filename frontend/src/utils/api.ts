import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@/config/config";

/**
 * Shared axios instance.
 *
 * Talks to the backend through nginx (API_BASE_URL). On the frontend it
 * receives a JWT via a request interceptor from wherever the token is stored,
 * and transparently attempts a refresh when a 401 comes back.
 *
 * Token storage is intentionally NOT wired yet — the auth flow hasn't shipped.
 * When it does, provide getAccessToken / refreshAccessToken / onTokenRefreshed
 * and it'll light up. See Family_Tree's utils/api.ts for the original shape.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// What the access token document looks like (adapt when auth lands).
const getAccessToken = (): string | null => {
  // TODO(auth): read from your auth store / localStorage.
  return null;
};

const refreshAccessToken = async (): Promise<string | null> => {
  // TODO(auth): POST /auth/refresh, return the new access token.
  return null;
};

const onTokenRefreshed = (token: string): void => {
  // TODO(auth): persist the new token the same way it was read above.
  void token;
};

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, try one refresh then retry the original request once.
let refreshInFlight: Promise<string | null> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._retried) {
      original._retried = true;

      // Deduplicate concurrent refreshes.
      refreshInFlight ??= refreshAccessToken();
      const newToken = await refreshInFlight;
      refreshInFlight = null;

      if (newToken) {
        onTokenRefreshed(newToken);
        return api.request(original);
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Generic request helper — resolves to `T` or throws `AxiosError`.
 *
 * @example
 * const profile = await apiRequest<UserProfile>({ url: "/profile/" });
 */
export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await api.request<T>(config);
  return response.data;
}

/** True when the payload contains any file, so we must send multipart. */
export function hasFiles(data: unknown): boolean {
  return Object.values(data as Record<string, unknown>).some(
    (v) => v instanceof File || (Array.isArray(v) && v.some((x) => x instanceof File)),
  );
}

/** Build a FormData payload for multipart uploads. */
export function buildFormData(data: Record<string, unknown>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      value.forEach((item) => formData.append(key, item as string | Blob));
    } else {
      formData.append(key, value as string | Blob);
    }
  }
  return formData;
}
