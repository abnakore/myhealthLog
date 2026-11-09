/**
 * Notification API calls.
 * Maps to /api/v1/notifications/* endpoints.
 */
import { api } from "./api";

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  data: Record<string, string>;
  is_read: boolean;
  created_at: string;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const res = await api.get<PaginatedResponse<AppNotification>>(
    "/v1/notifications/",
    { params: { page_size: 50 } },
  );
  return res.data.results;
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await api.get<{ count: number }>("/v1/notifications/unread-count/");
  return res.data.count;
}

export async function markOneRead(id: number): Promise<AppNotification> {
  const res = await api.patch<AppNotification>(`/v1/notifications/${id}/`);
  return res.data;
}

export async function markAllRead(): Promise<{ marked_read: number }> {
  const res = await api.post<{ marked_read: number }>("/v1/notifications/read-all/");
  return res.data;
}

export async function dismissOne(id: number): Promise<void> {
  await api.delete(`/v1/notifications/${id}/`);
}

export async function dismissAll(): Promise<void> {
  await api.delete("/v1/notifications/");
}
