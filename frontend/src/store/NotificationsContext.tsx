/**
 * NotificationsContext
 *
 * Polls /api/v1/notifications/unread-count/ every 30 s while the user is
 * signed in. Full list is fetched lazily when the bell panel is opened.
 *
 * Design:
 *  - Unread count drives the badge — always up to date.
 *  - Full notification list loaded on demand (opening the panel).
 *  - Optimistic updates: marking read / dismissing updates local state
 *    immediately before the API call, so the UI feels instant.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  fetchNotifications,
  fetchUnreadCount,
  markOneRead,
  markAllRead,
  dismissOne,
  dismissAll,
  type AppNotification,
} from "@/services/notifications";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

interface NotificationsContextValue {
  /** Running unread count — drives the bell badge. */
  unreadCount: number;
  /** Full list, loaded when the panel is opened. Null = not yet loaded. */
  notifications: AppNotification[] | null;
  isLoading: boolean;

  /** Open the panel — fetches the full list if not already loaded. */
  openPanel: () => void;
  closePanel: () => void;
  panelOpen: boolean;

  markRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismiss: (id: number) => Promise<void>;
  dismissAllNotifications: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Polling — unread count only (lightweight)
  // ---------------------------------------------------------------------------
  const pollCount = useCallback(async () => {
    if (!isAuthed) return;
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      // Silently swallow — network errors during polling shouldn't show UI errors
    }
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed) {
      setUnreadCount(0);
      setNotifications(null);
      if (pollTimer.current) clearInterval(pollTimer.current);
      return;
    }
    // Immediate first poll
    void pollCount();
    pollTimer.current = setInterval(pollCount, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [isAuthed, pollCount]);

  // ---------------------------------------------------------------------------
  // Panel open/close
  // ---------------------------------------------------------------------------
  const openPanel = useCallback(async () => {
    setPanelOpen(true);
    // Load full list if not yet fetched or stale
    setIsLoading(true);
    try {
      const list = await fetchNotifications();
      setNotifications(list);
      // Sync unread count from the freshly loaded list
      setUnreadCount(list.filter((n) => !n.is_read).length);
    } catch {
      /* panel will show empty state */
    } finally {
      setIsLoading(false);
    }
  }, []);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const markRead = useCallback(async (id: number) => {
    // Optimistic update
    setNotifications((prev) =>
      prev ? prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)) : prev,
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await markOneRead(id);
    } catch {
      // Revert on failure — re-fetch
      const list = await fetchNotifications().catch(() => null);
      if (list) {
        setNotifications(list);
        setUnreadCount(list.filter((n) => !n.is_read).length);
      }
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    // Optimistic
    setNotifications((prev) =>
      prev ? prev.map((n) => ({ ...n, is_read: true })) : prev,
    );
    setUnreadCount(0);
    try {
      await markAllRead();
    } catch {
      const list = await fetchNotifications().catch(() => null);
      if (list) {
        setNotifications(list);
        setUnreadCount(list.filter((n) => !n.is_read).length);
      }
    }
  }, []);

  const dismiss = useCallback(async (id: number) => {
    // Optimistic
    setNotifications((prev) => (prev ? prev.filter((n) => n.id !== id) : prev));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await dismissOne(id);
    } catch {
      const list = await fetchNotifications().catch(() => null);
      if (list) {
        setNotifications(list);
        setUnreadCount(list.filter((n) => !n.is_read).length);
      }
    }
  }, []);

  const dismissAllNotifications = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);
    try {
      await dismissAll();
    } catch {
      const list = await fetchNotifications().catch(() => null);
      if (list) {
        setNotifications(list);
        setUnreadCount(list.filter((n) => !n.is_read).length);
      }
    }
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      unreadCount,
      notifications,
      isLoading,
      openPanel,
      closePanel,
      panelOpen,
      markRead,
      markAllAsRead,
      dismiss,
      dismissAllNotifications,
    }),
    [
      unreadCount, notifications, isLoading,
      openPanel, closePanel, panelOpen,
      markRead, markAllAsRead, dismiss, dismissAllNotifications,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within <NotificationsProvider>");
  return ctx;
}
