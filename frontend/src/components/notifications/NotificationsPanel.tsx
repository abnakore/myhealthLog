/**
 * NotificationsPanel — slide-in panel listing all notifications.
 *
 * Opened by the NotificationBell. On desktop it appears as a fixed panel
 * anchored to the right of the screen. On mobile it slides up from the
 * bottom as a sheet.
 *
 * Each notification:
 *  - Has an icon keyed by `kind`
 *  - Shows title + body + relative time
 *  - Unread items have a teal dot and highlighted background
 *  - Clicking marks it read
 *  - The dismiss (×) button removes it
 *
 * The panel has "Mark all read" and "Clear all" actions in the header.
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { recordPath, type LinkableRecord } from "@/lib/recordLinks";
import { useNotifications } from "@/store/NotificationsContext";
import type { AppNotification } from "@/services/notifications";
import { Spinner } from "@/components/ui/Spinner";
import {
  BellIcon,
  CheckIcon,
  CloseIcon,
  DocumentIcon,
  PlusIcon,
  ShieldIcon,
  StethoscopeIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";

// ---------------------------------------------------------------------------
// Icon map — one icon per notification kind
// ---------------------------------------------------------------------------

const KIND_ICONS: Record<string, React.ElementType> = {
  WELCOME:                PlusIcon,
  RECORD_ADDED:           PlusIcon,
  RECORD_UPDATED:         CheckIcon,
  RECORD_DELETED:         TrashIcon,
  DOCUMENT_EXTRACTED:     DocumentIcon,
  DOCUMENT_EXTRACT_FAILED: DocumentIcon,
  PROVIDER_CREATED:       StethoscopeIcon,
  PROVIDER_NOTE_ADDED:    DocumentIcon,
  SHARE_FIRST_OPENED:     ShieldIcon,
  PROXY_INVITE_RECEIVED:  UsersIcon,
  PROXY_INVITE_ACCEPTED:  UsersIcon,
  PROXY_INVITE_DECLINED:  UsersIcon,
  PROXY_ACCESS_REVOKED:   UsersIcon,
  RECORD_REVIEW:          StethoscopeIcon,
};

// Accent colours per kind group
const KIND_COLOUR: Record<string, string> = {
  WELCOME:                "bg-mhl-accent-lo text-mhl-accent",
  RECORD_ADDED:           "bg-mhl-good-lo text-mhl-good",
  RECORD_UPDATED:         "bg-mhl-good-lo text-mhl-good",
  RECORD_DELETED:         "bg-mhl-danger-lo text-mhl-danger",
  DOCUMENT_EXTRACTED:     "bg-mhl-accent-lo text-mhl-accent",
  DOCUMENT_EXTRACT_FAILED:"bg-mhl-danger-lo text-mhl-danger",
  PROVIDER_CREATED:       "bg-mhl-accent-lo text-mhl-accent",
  PROVIDER_NOTE_ADDED:    "bg-mhl-accent-lo text-mhl-accent",
  SHARE_FIRST_OPENED:     "bg-mhl-accent-lo text-mhl-accent",
  PROXY_INVITE_RECEIVED:  "bg-[oklch(0.94_0.04_230)] text-[oklch(0.45_0.1_230)]",
  PROXY_INVITE_ACCEPTED:  "bg-mhl-good-lo text-mhl-good",
  PROXY_INVITE_DECLINED:  "bg-mhl-danger-lo text-mhl-danger",
  PROXY_ACCESS_REVOKED:   "bg-mhl-danger-lo text-mhl-danger",
};

function defaultColour(notif: AppNotification) {
  if (notif.kind === "RECORD_REVIEW") {
    // A review's tint follows how serious its top finding is.
    return notif.data?.level === "critical" || notif.data?.level === "danger"
      ? "bg-mhl-danger-lo text-mhl-danger"
      : "bg-[oklch(0.95_0.05_80)] text-[oklch(0.5_0.11_70)]";
  }
  return KIND_COLOUR[notif.kind] ?? "bg-mhl-sunk text-mhl-muted";
}

/** Singular or plural record types as notifications name them, to the route key. */
const RECORD_TYPE_ROUTE: Record<string, LinkableRecord> = {
  allergy: "allergies", allergies: "allergies",
  medication: "medications", medications: "medications",
  condition: "conditions", conditions: "conditions",
  appointment: "appointments", appointments: "appointments", visit: "appointments",
  document: "documents", documents: "documents", lab: "documents", imaging: "documents",
  vital: "measurements", measurement: "measurements", measurements: "measurements",
  immunization: "immunizations", immunizations: "immunizations",
};

/** Where a notification opens: its own link, or else the record it is about. */
function notificationLink(notif: AppNotification): string | undefined {
  const data = notif.data as Record<string, unknown> | undefined;
  if (typeof data?.link === "string" && data.link) return data.link;
  const type = typeof data?.record_type === "string" ? RECORD_TYPE_ROUTE[data.record_type] : undefined;
  const id = typeof data?.record_id === "string" ? data.record_id : undefined;
  return type && id ? recordPath(type, id) : undefined;
}

// ---------------------------------------------------------------------------
// Single notification row
// ---------------------------------------------------------------------------

interface NotifRowProps {
  notif: AppNotification;
  onRead: (id: number) => void;
  onDismiss: (id: number) => void;
}

function NotifRow({ notif, onRead, onDismiss }: NotifRowProps) {
  const Icon = KIND_ICONS[notif.kind] ?? BellIcon;
  const colour = defaultColour(notif);
  const navigate = useNavigate();

  function handleClick() {
    if (!notif.is_read) onRead(notif.id);
    const link = notificationLink(notif);
    if (link) navigate(link);
  }

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 px-4 py-3.5 transition-colors",
        !notif.is_read && "bg-mhl-accent-lo/30",
        "hover:bg-mhl-sunk cursor-pointer",
      )}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
    >
      {/* Unread dot */}
      {!notif.is_read && (
        <span
          aria-hidden="true"
          className="absolute left-1.5 top-5 h-1.5 w-1.5 rounded-full bg-mhl-accent"
        />
      )}

      {/* Icon */}
      <span
        className={cn(
          "mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-full text-sm",
          colour,
        )}
      >
        <Icon size={17} />
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1 pr-6">
        <p
          className={cn(
            "text-mhl-body leading-snug text-mhl-ink",
            !notif.is_read && "font-semibold",
          )}
        >
          {notif.title}
        </p>
        {notif.body && (
          <p className="mt-0.5 line-clamp-2 text-mhl-fine text-mhl-muted">
            {notif.body}
          </p>
        )}
        <p className="mt-1 text-[0.72rem] text-mhl-faint">
          {formatRelative(notif.created_at)}
        </p>
      </div>

      {/* Dismiss */}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(notif.id);
        }}
        className={cn(
          "absolute right-3 top-3.5 grid h-6 w-6 place-items-center rounded-full",
          "text-mhl-faint opacity-0 transition-opacity",
          "hover:bg-mhl-rule hover:text-mhl-muted",
          "group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function NotificationsPanel() {
  const {
    notifications,
    unreadCount,
    isLoading,
    panelOpen,
    closePanel,
    markRead,
    markAllAsRead,
    dismiss,
    dismissAllNotifications,
  } = useNotifications();

  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    function onOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanel();
      }
    }
    // Slight delay so the toggle click doesn't immediately close the panel
    const t = setTimeout(() => document.addEventListener("mousedown", onOutside), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [panelOpen, closePanel]);

  // Close on Escape
  useEffect(() => {
    if (!panelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen, closePanel]);

  if (!panelOpen) return null;

  const list = notifications ?? [];
  const isEmpty = !isLoading && list.length === 0;

  return (
    <>
      {/* Backdrop — mobile only */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/20 lg:hidden"
        onClick={closePanel}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
        className={cn(
          // Mobile: slide-up sheet from bottom
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col",
          "rounded-t-[1.25rem] border border-mhl-rule bg-mhl-surface shadow-xl",
          // Desktop: fixed dropdown below the bell
          "lg:inset-auto lg:right-4 lg:top-16 lg:bottom-auto lg:w-[22rem]",
          "lg:rounded-mhl lg:max-h-[80vh]",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-mhl-rule px-4 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-mhl-body font-bold text-mhl-ink">Notifications</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-mhl-accent px-2 py-0.5 text-[0.68rem] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="rounded px-2 py-1 text-mhl-fine font-semibold text-mhl-accent hover:bg-mhl-accent-lo"
              >
                Mark all read
              </button>
            )}
            {list.length > 0 && (
              <button
                type="button"
                onClick={() => void dismissAllNotifications()}
                className="rounded px-2 py-1 text-mhl-fine font-semibold text-mhl-muted hover:bg-mhl-sunk hover:text-mhl-ink"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close notifications"
              className="ml-1 grid h-8 w-8 place-items-center rounded-full text-mhl-muted hover:bg-mhl-sunk hover:text-mhl-ink"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size={24} />
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-mhl-sunk text-mhl-faint">
                <BellIcon size={26} strokeWidth={1.5} />
              </span>
              <div>
                <p className="text-mhl-body font-semibold text-mhl-ink">All caught up</p>
                <p className="mt-0.5 text-mhl-fine text-mhl-muted">
                  Notifications about your record will appear here.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-mhl-rule" role="list">
              {list.map((n) => (
                <li key={n.id}>
                  <NotifRow
                    notif={n}
                    onRead={markRead}
                    onDismiss={dismiss}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
