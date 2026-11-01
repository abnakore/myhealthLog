import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useAuth } from "@/auth/AuthContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { buttonStyles } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ProxyBanner } from "@/components/proxy/ProxyBanner";
import { RecordSwitcher } from "@/components/proxy/RecordSwitcher";
import { ContextBanner } from "@/components/context/ContextBanner";
import { LogoutIcon, PlusIcon } from "@/components/icons";
import { primaryNav, recordNav, type NavItem } from "./nav";

function Wordmark({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/app" onClick={onNavigate} className="inline-flex items-center gap-2">
      <span className="grid h-8 w-8 flex-none place-items-center rounded-[0.6rem] bg-mhl-accent text-white">
        <PlusIcon size={18} strokeWidth={2.5} />
      </span>
      <span className="text-mhl-lead font-bold tracking-[-0.02em] text-mhl-ink">myHealthLog</span>
    </Link>
  );
}

function RailLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-mhl-sm px-3 py-2.5 text-mhl-body transition-colors",
          isActive
            ? "bg-mhl-accent-lo font-semibold text-mhl-accent"
            : "text-mhl-ink hover:bg-mhl-sunk",
        )
      }
    >
      <Icon size={20} />
      <span>{item.label}</span>
    </NavLink>
  );
}

function TabLink({ item, accent = false }: { item: NavItem; accent?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "relative flex flex-col items-center justify-center gap-1 py-2",
          isActive ? "text-mhl-accent" : "text-mhl-muted",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-x-5 top-0 h-0.5 rounded-full bg-mhl-accent transition-opacity",
              isActive ? "opacity-100" : "opacity-0",
            )}
          />
          <span
            className={cn(
              "grid place-items-center rounded-full transition-colors",
              accent && "h-9 w-9 bg-mhl-accent text-white",
            )}
          >
            <Icon size={accent ? 22 : 23} strokeWidth={accent ? 2.25 : 1.75} />
          </span>
          <span className={cn("text-[0.7rem] leading-none", isActive && "font-semibold")}>
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}

const ADD_ITEM: NavItem = { to: "/app/add", label: "Add", icon: PlusIcon };

/** The app frame: a left rail from `lg` up, a top bar + docked tab bar on smaller
    screens. Content renders through <Outlet /> inside a single reading column.

    Two things from the care-proxy layer live here rather than on any page, because
    they have to be true of *every* page: the switcher (whose record am I in) and the
    banner that says so out loud once you've left your own. */
export function AppShell() {
  const { user, logout } = useAuth();
  const { canEdit } = useCareProxy();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-dvh bg-mhl-bg">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 hidden w-[16.5rem] flex-col border-r border-mhl-rule bg-mhl-surface px-4 py-6 lg:flex">
        <div className="px-2">
          <Wordmark />
        </div>

        <RecordSwitcher />

        {canEdit && (
          <Link to="/app/add" className={cn(buttonStyles("primary", "md", true), "mt-6")}>
            <PlusIcon size={18} strokeWidth={2.25} />
            Add record
          </Link>
        )}

        <nav className="mt-6 flex flex-col gap-1">
          {primaryNav.map((item) => (
            <RailLink key={item.to} item={item} />
          ))}
        </nav>

        <p className="mt-6 px-3 text-mhl-fine text-mhl-faint">Your records</p>
        <nav className="mt-1 flex flex-col gap-1">
          {recordNav.map((item) => (
            <RailLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 border-t border-mhl-rule pt-4">
          <Avatar name={user?.name ?? "You"} photoUrl={user?.photoUrl} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-mhl-fine font-semibold text-mhl-ink">{user?.name}</p>
            <p className="truncate text-[0.75rem] text-mhl-muted">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className="grid h-9 w-9 flex-none place-items-center rounded-full text-mhl-muted hover:bg-mhl-sunk hover:text-mhl-ink"
          >
            <LogoutIcon size={20} />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="lg:pl-[16.5rem]">
        {/* Mobile top bar — the switcher rides with it when there's another record
            to step into, so the context is changeable on a phone too. */}
        <header className="sticky top-0 z-30 border-b border-mhl-rule bg-mhl-bg/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Wordmark />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="grid h-9 w-9 place-items-center rounded-full text-mhl-muted hover:bg-mhl-sunk hover:text-mhl-ink"
            >
              <LogoutIcon size={20} />
            </button>
          </div>
          <RecordSwitcher variant="bar" />
        </header>

        <ProxyBanner />
        <ContextBanner />

        <main className="mx-auto w-full max-w-[42rem] px-4 pb-28 pt-6 lg:px-8 lg:pb-14">
          <Outlet />
        </main>
      </div>

      {/* Mobile docked tab bar. The Add tab stays even in a view-only context: it
          lands on the Add page, which explains the access rather than pretending the
          flow doesn't exist. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-mhl-rule bg-mhl-surface/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <TabLink item={primaryNav[0]} />
        <TabLink item={primaryNav[1]} />
        <TabLink item={primaryNav[2]} />
        <TabLink item={ADD_ITEM} accent />
      </nav>
    </div>
  );
}
