/**
 * Core axios instance for myHealthLog.
 *
 * Token storage: access token in memory, refresh token in localStorage
 * (httpOnly cookies are not available in this SPA-over-CORS setup).
 *
 * Flow:
 *  1. Every request gets `Authorization: Bearer <access>`.
 *  2. On 401, one refresh attempt is made (POST /auth/refresh/).
 *  3. If the refresh succeeds the original request is retried with the new token.
 *  4. If the refresh fails (expired or absent) a global `auth:logout` event fires
 *     so AuthContext can clear state and redirect to /login.
 */
import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@/config/config";
import { getActAsUser } from "./activeRecord";

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

const REFRESH_KEY = "mhl.auth.refresh";
const ACCESS_KEY  = "mhl.auth.access";

export function getAccessToken(): string | null {
  // Access token lives in sessionStorage so it is cleared when the tab closes.
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function saveTokens(access: string, refresh: string): void {
  sessionStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  sessionStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach the access token to every request, and the record being acted on.
// A care proxy stepped into someone else's record sends that owner's id; the
// backend checks the live grant and answers with the owner's data (or refuses).
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const actAs = getActAsUser();
  if (actAs) {
    config.headers["X-Act-As-User"] = actAs;
  } else if (config.headers["X-Act-As-User"]) {
    delete config.headers["X-Act-As-User"];
  }
  return config;
});

// Deduplicated refresh — only one inflight request at a time.
let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const res = await axios.post<{ access: string; refresh?: string }>(
      `${API_BASE_URL}/v1/auth/refresh/`,
      { refresh },
      { headers: { "Content-Type": "application/json" } },
    );
    const newAccess = res.data.access;
    // The backend rotates refresh tokens and blacklists the old one, so keep the
    // new one — storing the used token would log the person out on the next refresh.
    saveTokens(newAccess, res.data.refresh ?? refresh);
    return newAccess;
  } catch {
    clearTokens();
    window.dispatchEvent(new CustomEvent("auth:logout"));
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._retried) {
      original._retried = true;
      refreshInFlight ??= doRefresh();
      const newToken = await refreshInFlight;
      refreshInFlight = null;
      if (newToken) {
        return api.request(original);
      }
    }
    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract field-level validation errors from a backend 400 response.
 * The backend returns them as { error: { details: { field: ["msg", ...] } } }.
 */
export function apiFieldErrors(err: unknown): Record<string, string> {
  if (!axios.isAxiosError(err)) return {};
  const data = err.response?.data as
    | { error?: { details?: Record<string, string[] | string> } }
    | undefined;
  const details = data?.error?.details;
  if (!details || typeof details !== "object") return {};

  const fieldErrors: Record<string, string> = {};
  for (const [field, value] of Object.entries(details)) {
    const message = Array.isArray(value) ? value[0] : value;
    if (typeof message === "string") fieldErrors[field] = message;
  }
  return fieldErrors;
}

/** Extract a user-friendly error message from an AxiosError. */
export function apiErrorMessage(err: unknown): string {
  // Errors raised on purpose by the app carry a message meant for the person.
  if (err instanceof Error && err.name === "DocumentCheckCancelled") return err.message;
  if (!axios.isAxiosError(err)) return "An unexpected error occurred.";
  const data = err.response?.data as Record<string, unknown> | undefined;
  const status = err.response?.status;

  if (status === 401) return "Incorrect email or password.";

  // A validation failure's summary is generic ("One or more fields are invalid."),
  // so prefer the specific field messages when the backend supplies them.
  const details = (data?.error as Record<string, unknown> | undefined)?.details;
  if (details && typeof details === "object") {
    const first = Object.values(details as Record<string, unknown>)[0];
    const message = Array.isArray(first) ? first[0] : first;
    if (typeof message === "string") return message;
  }

  // Our backend wraps errors in { error: { message } }
  if (data?.error && typeof (data.error as Record<string, unknown>).message === "string") {
    return (data.error as Record<string, unknown>).message as string;
  }
  if (typeof data?.detail === "string") return data.detail;
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "The requested resource was not found.";
  if (status === 503) return "This feature is temporarily unavailable.";
  return "Something went wrong. Please try again.";
}

/** POST or PATCH with a File field: sends multipart/form-data.
 *
 * Arrays (condition_ids, reactions, triggers) are JSONField columns on the
 * backend, so they must go as one JSON string. Repeating the key instead makes
 * DRF read a bare UUID and reject it with "Value must be valid JSON."
 */
export function buildFormData(data: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      fd.append(key, JSON.stringify(value));
    } else if (value instanceof File) {
      fd.append(key, value, value.name);
    } else {
      fd.append(key, String(value));
    }
  }
  return fd;
}

/** True when any field value is a File. */
export function hasFile(data: Record<string, unknown>): boolean {
  return Object.values(data).some((v) => v instanceof File);
}
