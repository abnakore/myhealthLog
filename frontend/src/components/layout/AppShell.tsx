import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useAuth } from "@/auth/AuthContext";
import { useAppMode } from "@/store/AppModeContext";
import { useRecords } from "@/store/RecordsContext";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { ProxyBanner } from "@/components/proxy/ProxyBanner";
import { RecordSwitcher } from "@/components/proxy/RecordSwitcher";
import { ModeBanner } from "@/components/modes/ModeBanner";
import { ModeSwitcher } from "@/components/modes/ModeSwitcher";
import { ModeSync } from "@/components/modes/ModeSync";
import { ModeTransition } from "@/components/modes/ModeTransition";
import { ProfileTransition } from "@/components/modes/ProfileTransition";
import { CriticalConditionModal } from "@/components/modes/CriticalConditionModal";
import { CareFocusModal } from "@/components/modes/CareFocusModal";
import { useFocusFacets } from "@/store/careFocusStore";
import { guideFor } from "@/lib/conditionGuide";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import {
  LogoutIcon,
  PlusIcon,
  ChevronRightIcon,
  ConditionIcon,
  LungsIcon,
  RecordsIcon,
} from "@/components/icons";
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

/** The quiet slogan each mode signs its rail with: the preview's parting line,
    under that mode's own illustration from the preview. */
function RailTagline({ lines }: { lines: string[] }) {
  return (
    <p aria-hidden="true" className="mhl-rail-art mt-3 px-1 text-[0.72rem] font-normal leading-snug text-mhl-faint">
      {lines.join(" ")}
    </p>
  );
}

/** The rail's mode slogans, from the references. */
const RAIL_TAGLINES: Record<string, string[]> = {
  elderly: ["Good health", "brings peace of mind."],
  critical: ["Better care.", "More control.", "Always."],
  pregnancy: ["Healthy you.", "Healthy baby.", "Brighter tomorrow."],
};

/** The app frame: a warm rail from `lg` up, a top bar + docked tab bar below it.
    Every screen keeps the same three anchors — where you are, the record's six
    shelves, and who you're signed in as — so navigating never changes shape. */
export function AppShell() {
  const { user, logout } = useAuth();
  const { mode } = useAppMode();
  const { conditions } = useRecords();
  const facets = useFocusFacets();
  const [severalOpen, setSeveralOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [focusOpen, setFocusOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);

  // The dashboard opens edge to edge — it's a composition of cards, and a
  // capped column left a dead margin on wide screens. Reading pages keep their
  // measure, centred so the page reads as composed rather than parked left.
  const isDashboard = pathname === "/app" || pathname === "/app/";
  const isDocuments = pathname === "/app/documents";
  const isAddRecord = pathname === "/app/add";
  // Elderly care adapts the screens whenever it is in focus (bigger text and
  // targets); the four-tab elderly layout is only for elderly care on its own.
  const isElderly = facets.elderly;
  const elderlyLayout = isElderly;

  // Dialogs render outside this frame, so the page root carries the marker
  // too: the larger elderly text then reaches them as well.
  useEffect(() => {
    const root = document.documentElement;
    if (isElderly) root.setAttribute("data-elderly", "");
    else root.removeAttribute("data-elderly");
    return () => root.removeAttribute("data-elderly");
  }, [isElderly]);

  // Every condition in focus gets its own card at the rail's foot, in rank order.
  const focusConditions = facets.conditionIds
    .map((id) => conditions.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .slice(0, 3);
  const nav = navForMode(mode, { elderly: facets.elderly, pregnancy: facets.pregnancy });

  const viewingLine = facets.multi
    ? `Adapted for ${facets.ranked.map((r) => r.label.toLowerCase()).join(", ")}.`
    : mode === "critical"
      ? "Focused on your selected condition."
      : mode === "pregnancy"
        ? "Your pregnancy journey is our focus."
        : mode === "standard"
          ? "Your complete record, nothing pushed forward."
          : null;

  // "Your records" is a destination of its own on a phone: one tab opens the
  // same six shelves the rail lists, as a sheet. It reads as current when the
  // page behind it is any of them — including a record's detail page.
  const recordsActive =
    pathname.startsWith("/app/records/") ||
    nav.record.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));

  // Elderly mobile: four large plain-language tabs (Home + records + visits +
  // emergency). Appointments stay one tap away on the dashboard's upcoming card.
  const elderlyTabs: NavItem[] = [nav.primary[0], ...nav.record].slice(0, 4).filter(Boolean) as NavItem[];

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div
      data-mode={mode === "standard" ? "normal" : mode}
      data-elderly={isElderly ? "" : undefined}
      className={cn("min-h-dvh bg-mhl-bg", isElderly && "text-[1.04rem]")}
    >
      <ModeSync />
      <ModeTransition />
      <ProfileTransition />
      {/* Notifications panel — rendered at root level of the shell so it
          can be z-indexed correctly above both the rail and the content. */}
      <NotificationsPanel />

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
        {/* The mode dropdown, in every mode: you're viewing X, and why. */}
        <div className="mt-4">
          {!elderlyLayout && (
            <p className="mb-1.5 px-1 text-[0.78rem] font-medium text-mhl-faint">You're viewing</p>
          )}
          <ModeSwitcher />
          {viewingLine && (
            <p className="mt-1.5 px-1 text-[0.74rem] leading-snug text-mhl-faint">{viewingLine}</p>
          )}
        </div>

        {/* In Pregnancy and Critical the reference puts the one coral action in
            the rail; in Normal and Elderly it lives on the dashboard instead. */}
        {(mode === "critical" || mode === "pregnancy") && (
          <Link
            to="/app/add"
            className="mhl-interactive mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full bg-mhl-accent px-4 text-[0.95rem] font-bold text-white shadow-[0_6px_16px_-8px_oklch(0.45_0.15_28/0.6)] transition-colors hover:bg-mhl-accent-strong"
          >
            <PlusIcon size={18} strokeWidth={2.5} />
            Add record
          </Link>
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

          {/* Every condition in focus, one card each, one tap to change the
              focus, so what the app is adapted to is always in view. */}
          {focusConditions.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => (facets.multi ? setSeveralOpen(true) : setFocusOpen(true))}
              className={cn(
                "mhl-interactive flex min-w-0 items-center gap-2.5 rounded-mhl-sm bg-mhl-accent-lo px-3 py-3 text-left transition-colors hover:bg-mhl-accent/20",
                i === 0 ? "mt-3" : "mt-1.5",
              )}
            >
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-mhl-accent text-white">
                {guideFor(c).family === "respiratory" ? <LungsIcon size={18} /> : <ConditionIcon size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9rem] font-bold text-mhl-ink">{c.name}</span>
                <span className="block truncate text-[0.74rem] text-mhl-muted">
                  {c.status === "ACTIVE" ? "Active condition" : c.status === "IN_REMISSION" ? "In remission" : "Resolved"}
                </span>
              </span>
              <span className="flex-none text-mhl-faint">
                <ChevronRightIcon size={16} />
              </span>
            </button>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-2.5 border-t border-mhl-rule pt-5">
          <Avatar name={user?.name ?? "You"} photoUrl={user?.photoUrl ?? undefined} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9rem] font-semibold leading-tight text-mhl-ink">
              {user?.name}
            </p>
            <p className="mt-0.5 truncate text-[0.78rem] leading-tight text-mhl-muted">
              {user?.email}
            </p>
          </div>
          <NotificationBell />
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className="grid h-8 w-8 flex-none place-items-center rounded-full text-mhl-muted transition-colors hover:bg-mhl-sunk hover:text-mhl-ink"
          >
            <LogoutIcon size={19} />
          </button>
        </div>

        {/* The mode's slogan closes the rail, under the person. */}
        {RAIL_TAGLINES[mode] && <RailTagline lines={RAIL_TAGLINES[mode]} />}
      </aside>

      {/* Main column */}
      <div className="mhl-canvas lg:pl-[16.5rem]">
        {/* Mobile top bar. The switcher rides with it when there's another record
            to step into, so the context is changeable on a phone too. */}
        <header className="sticky top-0 z-30 border-b border-mhl-rule bg-mhl-bg/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Wordmark />
            <div className="flex items-center gap-1">
              <NotificationBell />
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Log out"
                className="grid h-9 w-9 place-items-center rounded-full text-mhl-muted transition-colors hover:bg-mhl-sunk hover:text-mhl-ink"
              >
                <LogoutIcon size={20} />
              </button>
            </div>
          </div>
          <RecordSwitcher variant="bar" />
          <div className="border-t border-mhl-rule px-4 py-2">
            <ModeSwitcher compact />
          </div>
        </header>

        <ProxyBanner />
        {/* The home screen states its mode in the rail and in its own hero; every
            other page keeps the one-tap banner. */}
        {!isDashboard && <ModeBanner />}

        <main
          className={cn(
            "w-full px-4 pb-28 pt-7 lg:px-10 lg:pb-14 lg:pt-9",
            isDashboard
              ? // The dashboard fills the column it's given — every reference is a
                // full-bleed composition, and the old 80rem cap stranded the right
                // third of a wide screen as dead paper.
                ""
              : isDocuments
                ? "mx-auto max-w-[44rem] lg:max-w-[64rem] min-[80rem]:max-w-[76rem]"
                : isAddRecord
                  ? "mx-auto max-w-[44rem] lg:max-w-[48rem]"
                  : "mx-auto max-w-[44rem] lg:max-w-[56rem]",
          )}
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile docked tab bar. The Add tab stays even in a view-only context: it
          lands on the Add page, which explains the access rather than pretending the
          flow doesn't exist. Elderly mode swaps it for four large plain tabs. */}
      {elderlyLayout ? (
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
        <>
          <nav
            className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-mhl-rule bg-mhl-surface/95 backdrop-blur lg:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            aria-label="Primary"
          >
            <TabLink item={nav.primary[0]} large={isElderly} />
            <button
              type="button"
              onClick={() => setRecordsOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={recordsOpen}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 py-2",
                recordsOpen || recordsActive ? "text-mhl-accent" : "text-mhl-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-4 top-0 h-0.5 rounded-full bg-mhl-accent transition-opacity",
                  recordsOpen || recordsActive ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="grid place-items-center rounded-full">
                <RecordsIcon size={23} strokeWidth={1.75} />
              </span>
              <span
                className={cn(
                  "text-[0.7rem] leading-none",
                  (recordsOpen || recordsActive) && "font-semibold",
                )}
              >
                Records
              </span>
            </button>
            <TabLink item={nav.primary[1]} large={isElderly} />
            <TabLink item={nav.primary[2]} large={isElderly} />
            <TabLink item={ADD_ITEM} accent />
          </nav>

          <Modal
            open={recordsOpen}
            onClose={() => setRecordsOpen(false)}
            title="Your records"
            description="Every shelf of the record, one tap away."
          >
            <nav aria-label="Your records" className="flex flex-col gap-1">
              {nav.record.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to + item.label}
                    to={item.to}
                    onClick={() => setRecordsOpen(false)}
                    className="mhl-interactive flex min-h-12 items-center gap-3 rounded-mhl-sm px-2 py-2 text-[0.99rem] font-medium text-mhl-ink hover:bg-mhl-sunk"
                  >
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
                      <Icon size={20} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className="flex-none text-mhl-faint">
                      <ChevronRightIcon size={17} />
                    </span>
                  </Link>
                );
              })}
            </nav>
          </Modal>
        </>
      )}

      <CareFocusModal open={severalOpen} onClose={() => setSeveralOpen(false)} />
      <CriticalConditionModal
        open={focusOpen}
        mode="critical"
        onClose={() => setFocusOpen(false)}
        onDone={() => setFocusOpen(false)}
      />
    </div>
  );
}
