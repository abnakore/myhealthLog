/**
 * The four shortcuts that close the dashboard's right column. Each is a tinted
 * tile with the label under it — the same size, so the row scans as one strip and
 * never reflows between labels. The coral tile is the one write; the rest are
 * reads, which is why only it carries the filled colour.
 */
import { Link } from "react-router-dom";
import { DocumentIcon, PlusIcon, TimelineIcon, UserIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

interface QuickAction {
  to: string;
  label: string;
  Icon: typeof PlusIcon;
  /** The tile's tint + ink. */
  tone: string;
  /** The one filled tile: this is the page's single write. */
  filled?: boolean;
  /** Only shown to someone who may add records. */
  canEdit?: boolean;
}

const ACTIONS: QuickAction[] = [
  {
    to: "/app/add",
    label: "Add record",
    Icon: PlusIcon,
    tone: "bg-mhl-accent text-white ring-[3px] ring-mhl-accent-lo",
    filled: true,
    canEdit: true,
  },
  {
    to: "/app/profile",
    label: "View summary",
    Icon: DocumentIcon,
    tone: "bg-mhl-accent-lo text-mhl-accent",
  },
  {
    to: "/app/profile",
    label: "Medical profile",
    Icon: UserIcon,
    tone: "bg-mhl-info-lo text-mhl-info",
  },
  {
    to: "/app/timeline",
    label: "View timeline",
    Icon: TimelineIcon,
    tone: "bg-mhl-good-lo text-mhl-good",
  },
];

export function QuickActions({ canEdit }: { canEdit: boolean }) {
  const actions = ACTIONS.filter((a) => !a.canEdit || canEdit);
  return (
    <section
      aria-labelledby="quick-actions-title"
      className={cn(
        "min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 pb-5 pt-5 shadow-mhl",
      )}
    >
      <h2
        id="quick-actions-title"
        className="text-[1.05rem] font-bold tracking-[-0.015em] text-mhl-ink"
      >
        Quick actions
      </h2>
      <div
        className={cn(
          "mt-4 grid gap-1.5",
          actions.length === 4 ? "grid-cols-4" : actions.length === 3 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        {actions.map(({ to, label, Icon, tone, filled }) => (
          <Link
            key={label}
            to={to}
            className="mhl-interactive group flex min-w-0 flex-col items-center gap-2.5 rounded-mhl-sm px-1 py-1 text-center"
          >
            <span
              className={cn(
                "grid h-12 w-12 place-items-center rounded-[0.95rem] transition-transform duration-200 ease-mhl group-hover:-translate-y-0.5",
                tone,
              )}
            >
              <Icon size={22} strokeWidth={filled ? 2.4 : 1.85} />
            </span>
            <span className="text-[0.655rem] font-semibold leading-[1.2] text-mhl-ink">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
