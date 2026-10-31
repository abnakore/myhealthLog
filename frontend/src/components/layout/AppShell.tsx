import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useAuth } from "@/auth/AuthContext";
import { useAppMode } from "@/store/AppModeContext";
import { useRecords } from "@/store/RecordsContext";
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
    <Link to="/app" onClick={onNavigate} className="inline-flex items-center gap-3">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-[0.7rem] bg-mhl-accent text-white shadow-[0_2px_6px_-2px_oklch(0.45_0.12_28/0.45)]">
        <PlusIcon size={21} strokeWidth={2.5} />
      </span>
      <span className="text-[1.36rem] font-bold leading-none tracking-[-0.028em] text-mhl-ink">
        myHealthLog
      </span>
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
          "group flex items-center gap-3 rounded-[0.7rem] px-3 transition-colors duration-150",
          large ? "min-h-12 py-3 text-[1.02rem] font-medium" : "min-h-11 py-2.5 text-[0.99rem]",
          isActive
            ? "bg-mhl-accent-lo font-semibold text-mhl-accent"
            : "font-medium text-mhl-ink hover:bg-mhl-sunk",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "flex-none transition-colors",
              isActive ? "text-mhl-accent" : "text-mhl-muted group-hover:text-mhl-ink",
            )}
          >
            <Icon size={large ? 23 : 21} strokeWidth={isActive ? 2 : 1.7} />
          </span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </>
      )}
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

/** The app frame: a warm rail from `lg` up, a top bar + docked tab bar below it.
    Every screen keeps the same three anchors — where you are, the record's six
    shelves, and who you're signed in as — so navigating never changes shape. */
export function AppShell() {
  const { user, logout } = useAuth();
  const { mode, criticalConditionId } = useAppMode();
  const { conditions } = useRecords();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // The dashboard is the one page that needs the full two-column composition: on
  // wide screens it opens to the desktop width while every other page stays in
  // the 42rem reading column. Documents opens to a wide grid for its cards.
  const isDashboard = pathname === "/app" || pathname === "/app/";
  const isDocuments = pathname === "/app/documents";
  const isAddRecord = pathname === "/app/add";
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
    <div
      data-mode={mode === "standard" ? "normal" : mode}
      className={cn("min-h-dvh bg-mhl-bg", isElderly && "text-[1.04rem]")}
    >
      <ModeSync />

      {/* Desktop rail */}
      <aside
        aria-label="Sections"
        className="fixed inset-y-0 left-0 z-20 hidden w-[16.5rem] flex-col border-r border-mhl-rule bg-mhl-rail px-4 py-7 lg:flex"
      >
        <div className="px-2">
          <Wordmark />
        </div>

        {/* Only appears when there is a second record to step into — otherwise
            the rail stays the plain, quiet map the home page asks for. */}
        <RecordSwitcher />
        {mode !== "standard" && (
          <div className="mt-3">
            <ModeSwitcher />
          </div>
        )}

        <nav aria-label="Primary" className={cn("mt-7 flex flex-col gap-1", isElderly && "mt-5 gap-2")}>
          {nav.primary.map((item) => (
            <RailLink key={item.to} item={item} large={isElderly} />
          ))}
        </nav>

        <p className="mb-2 mt-7 px-3 text-[0.86rem] font-medium text-mhl-faint">Your records</p>
        <nav
          aria-label="Records"
          className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", isElderly ? "gap-2" : "gap-1")}
        >
          {nav.record.map((item) => (
            <RailLink key={item.to + item.label} item={item} large={isElderly} />
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-2.5 border-t border-mhl-rule pt-5">
          <Avatar name={user?.name ?? "You"} photoUrl={user?.photoUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9rem] font-semibold leading-tight text-mhl-ink">
              {user?.name}
            </p>
            <p className="mt-0.5 truncate text-[0.78rem] leading-tight text-mhl-muted">
              {user?.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className="grid h-8 w-8 flex-none place-items-center rounded-full text-mhl-muted transition-colors hover:bg-mhl-sunk hover:text-mhl-ink"
          >
            <LogoutIcon size={19} />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="mhl-canvas lg:pl-[16.5rem]">
        {/* Mobile top bar. The switcher rides with it when there's another record
            to step into, so the context is changeable on a phone too. */}
        <header className="sticky top-0 z-30 border-b border-mhl-rule bg-mhl-bg/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Wordmark />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="grid h-9 w-9 place-items-center rounded-full text-mhl-muted transition-colors hover:bg-mhl-sunk hover:text-mhl-ink"
            >
              <LogoutIcon size={20} />
            </button>
          </div>
          <RecordSwitcher variant="bar" />
          {mode !== "standard" && (
            <div className="border-t border-mhl-rule px-4 py-2">
              <ModeSwitcher compact />
            </div>
          )}
        </header>

        <ProxyBanner />
        <ContextBanner />
        <ModeBanner />

        <main
          className={cn(
            "w-full px-4 pb-28 pt-7 lg:px-8 lg:pb-12 lg:pt-8",
            isDashboard
              ? "min-[80rem]:max-w-[80rem]"
              : isDocuments
                ? "max-w-[44rem] lg:max-w-[64rem] min-[80rem]:max-w-[76rem]"
                : isAddRecord
                  ? "max-w-[44rem] lg:max-w-[48rem]"
                  : "max-w-[44rem] lg:max-w-[56rem]",
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
