/**
 * NotificationBell — the bell icon with a live unread badge.
 * Clicking it toggles the notification panel.
 */
import { cn } from "@/lib/cn";
import { useNotifications } from "@/store/NotificationsContext";
import { BellIcon } from "@/components/icons";

interface Props {
  className?: string;
}

export function NotificationBell({ className }: Props) {
  const { unreadCount, panelOpen, openPanel, closePanel } = useNotifications();

  function toggle() {
    if (panelOpen) closePanel();
    else void openPanel();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
      aria-pressed={panelOpen}
      className={cn(
        "relative grid h-9 w-9 flex-none place-items-center rounded-full transition-colors",
        "text-mhl-muted hover:bg-mhl-sunk hover:text-mhl-ink",
        panelOpen && "bg-mhl-sunk text-mhl-ink",
        className,
      )}
    >
      <BellIcon size={20} strokeWidth={1.75} />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-1 top-1 flex items-center justify-center rounded-full",
            "bg-mhl-accent text-white font-bold leading-none",
            unreadCount > 9
              ? "h-4 min-w-[1rem] px-1 text-[0.6rem]"
              : "h-4 w-4 text-[0.65rem]",
          )}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
