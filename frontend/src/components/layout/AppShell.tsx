import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useAuth } from "@/auth/AuthContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useAppMode } from "@/store/AppModeContext";
import { useRecords } from "@/store/RecordsContext";
import { buttonStyles } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ProxyBanner } from "@/components/proxy/ProxyBanner";
import { RecordSwitcher } from "@/components/proxy/RecordSwitcher";
import { ContextBanner } from "@/components/context/ContextBanner";
import { ModeBanner } from "@/components/modes/ModeBanner";
import { ModeSwitcher } from "@/components/modes/ModeSwitcher";
import { ModeSync } from "@/components/modes/ModeSync";
import { LogoutIcon, PlusIcon } from "@/components/icons";
import { navForMode, type NavItem } from "./nav";

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

function RailLink({ item, large = false }: { item: NavItem; large?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-mhl-sm px-3 transition-colors",
            large ? "py-3 text-[1.02rem] font-medium" : "py-2.5 text-mhl-body",
          isActive
            ? large
              ? "bg-mhl-accent font-semibold text-white"
              : "bg-mhl-accent-lo font-semibold text-mhl-accent"
            : "text-mhl-ink hover:bg-mhl-sunk",
        )
      }
    >
      <Icon size={large ? 22 : 20} />
      <span>{item.label}</span>
    </NavLink>
  );
}

function TabLink({ item, accent = false, large = false }: { item: NavItem; accent?: boolean; large?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "relative flex flex-col items-center justify-center gap-1 py-2",
          large && "py-2.5",
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
            <Icon size={accent ? 22 : large ? 26 : 23} strokeWidth={accent ? 2.25 : 1.75} />
          </span>
          <span className={cn(large ? "text-[0.8rem]" : "text-[0.7rem]", "leading-none", isActive && "font-semibold")}>
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
    banner that says so out loud once you've left your own. The mode lens lives here
    too (ModeSync + ModeSwitcher + navForMode) so every screen follows the focus. */
export function AppShell() {
  const { user, logout } = useAuth();
  const { canEdit } = useCareProxy();
  const { mode, criticalConditionId } = useAppMode();
  const { conditions } = useRecords();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // The dashboard is the one page that needs the full asymmetric grid: on
  // wide screens its column opens to the desktop width while every other page
  // stays in the 42rem reading column. Rail, top bar and dock untouched.
  const isDashboard = pathname === "/app" || pathname === "/app/";
  const isElderly = mode === "elderly";

  // Critical mode renames the Conditions entry after the focused condition,
  // so the rail says what it means ("Diabetes" instead of "Conditions").
  const criticalName = conditions.find((c) => c.id === criticalConditionId)?.name;
  const nav = navForMode(mode, criticalName);

  // Elderly mobile: four large plain-language tabs (Home + medicines + records
  // + emergency). Appointments stay one tap away on the dashboard's upcoming card.
  const elderlyTabs: NavItem[] = [
    nav.primary[0],
    nav.record[0],
    nav.record[2],
    nav.record[3],
  ].filter(Boolean) as NavItem[];

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div data-mode={mode === "standard" ? "normal" : mode} className={cn("min-h-dvh bg-mhl-bg", isElderly && "text-[1.04rem]")}>
      <ModeSync />
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 hidden w-[16.5rem] flex-col border-r border-mhl-rule bg-mhl-surface px-4 py-6 lg:flex">
        <div className="px-2">
          <Wordmark />
        </div>

        <RecordSwitcher />

        <div className="mt-4">
          <ModeSwitcher />
        </div>

        {canEdit && (
          <Link to="/app/add" className={cn(buttonStyles("primary", "md", true), "mt-6", isElderly && "min-h-12 text-mhl-lead")}>
            <PlusIcon size={18} strokeWidth={2.25} />
            Add record
          </Link>
        )}

        <nav aria-label="Primary" className={cn("flex flex-col gap-1", isElderly ? "mt-5" : "mt-6")}>
          {nav.primary.map((item) => (
            <RailLink key={item.to} item={item} large={isElderly} />
          ))}
        </nav>

        {!isElderly && <p className="mt-6 px-3 text-mhl-fine text-mhl-faint">Your records</p>}
        <nav aria-label="Records" className={cn("flex flex-col", isElderly ? "mt-3 gap-2" : "mt-1 gap-1")}>
          {nav.record.map((item) => (
            <RailLink key={item.to + item.label} item={item} large={isElderly} />
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
          {/* Mode switch on mobile: compact pill row so the four modes are
              reachable without the desktop rail. */}
          <div className="border-t border-mhl-rule px-4 py-2">
            <ModeSwitcher compact />
          </div>
        </header>

        <ProxyBanner />
        <ContextBanner />
        <ModeBanner />

        <main
          className={cn(
            "mx-auto w-full px-4 pb-28 pt-6 lg:px-8 lg:pb-14",
            isDashboard ? "lg:max-w-[46rem] min-[80rem]:max-w-[72rem]" : "max-w-[42rem]",
          )}
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile docked tab bar. The Add tab stays even in a view-only context: it
          lands on the Add page, which explains the access rather than pretending the
          flow doesn't exist. Elderly mode swaps it for four large plain tabs. */}
      {isElderly ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-mhl-rule bg-mhl-surface/95 backdrop-blur lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Primary"
        >
          {elderlyTabs.map((item) => (
            <TabLink key={item.to + item.label} item={item} large />
          ))}
        </nav>
      ) : (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-mhl-rule bg-mhl-surface/95 backdrop-blur lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Primary"
        >
          <TabLink item={nav.primary[0]} />
          <TabLink item={nav.primary[1]} />
          <TabLink item={nav.primary[2]} />
          <TabLink item={ADD_ITEM} accent />
        </nav>
      )}
    </div>
  );
}
