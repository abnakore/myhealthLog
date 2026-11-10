/**
 * The search box on Home. Searches the whole record (every shelf) plus the
 * app's own pages, and opens the match. Keyboard: arrows to move, Enter to
 * open, Escape to close.
 */
import { useId, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { recordPath } from "@/lib/recordLinks";
import { formatDate } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, formatVitalValue, vitalName } from "@/types/health";
import {
  AllergyIcon,
  CalendarIcon,
  ConditionIcon,
  DocumentIcon,
  PillIcon,
  SearchIcon,
  ShieldIcon,
  VaccineIcon,
  VitalsIcon,
  ChevronRightIcon,
} from "@/components/icons";

type Icon = ComponentType<{ size?: number; className?: string }>;

interface Hit {
  key: string;
  title: string;
  meta: string;
  to: string;
  Icon: Icon;
  /** Lower-cased text the query is matched against. */
  haystack: string;
}

const PAGES: { title: string; to: string; words: string }[] = [
  { title: "Emergency access", to: "/app/emergency", words: "emergency card qr code pin responder" },
  { title: "Care providers", to: "/app/providers", words: "doctor lab share access link provider" },
  { title: "Care proxy", to: "/app/proxy", words: "family proxy caregiver" },
  { title: "Condition profiles", to: "/app/contexts", words: "condition aware profile pregnancy diabetes" },
  { title: "Medical summary", to: "/app/summary", words: "summary overview immunisations vaccines" },
  { title: "Timeline", to: "/app/timeline", words: "history timeline" },
  { title: "Copilot", to: "/app/copilot", words: "copilot ask question assistant" },
  { title: "Profile", to: "/app/profile", words: "profile settings export data mode" },
];

const MAX_HITS = 8;

export function RecordSearch({ className }: { className?: string }) {
  const { allergies, medications, conditions, appointments, documents, immunizations, vitals } = useRecords();
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const index = useMemo<Hit[]>(() => {
    const hits: Hit[] = [];
    const push = (h: Omit<Hit, "haystack">, ...extra: (string | undefined | null)[]) =>
      hits.push({ ...h, haystack: [h.title, h.meta, ...extra].filter(Boolean).join(" ").toLowerCase() });

    for (const a of allergies)
      push({ key: `al-${a.id}`, title: a.substance, meta: "Allergy", to: recordPath("allergies", a.id), Icon: AllergyIcon }, ...(a.reactions ?? []), a.notes);
    for (const m of medications)
      push(
        { key: `md-${m.id}`, title: m.name, meta: [m.active ? "Medication" : "Stopped medication", m.dosage].filter(Boolean).join(" · "), to: recordPath("medications", m.id), Icon: PillIcon },
        m.reason, m.prescriber, m.notes,
      );
    for (const c of conditions)
      push({ key: `cn-${c.id}`, title: c.name, meta: "Condition", to: recordPath("conditions", c.id), Icon: ConditionIcon }, c.icd10Code, c.notes);
    for (const a of appointments)
      push(
        { key: `ap-${a.id}`, title: a.title, meta: `Visit · ${formatDate(a.scheduledFor)}`, to: recordPath("appointments", a.id), Icon: CalendarIcon },
        a.clinician, a.facility, a.reason, a.notes,
      );
    for (const d of documents)
      push(
        { key: `doc-${d.id}`, title: d.title, meta: DOCUMENT_TYPE_LABELS[d.docType], to: recordPath("documents", d.id), Icon: DocumentIcon },
        d.labName, d.provider, d.imagingType, d.bodyArea, d.findings, d.notes, d.fileName,
      );
    for (const im of immunizations)
      push({ key: `im-${im.id}`, title: im.vaccine, meta: `Immunisation · ${formatDate(im.administeredOn)}`, to: recordPath("immunizations", im.id), Icon: VaccineIcon });
    // Only the latest reading of each kind, so one measurement doesn't flood the list.
    const seen = new Set<string>();
    for (const v of [...vitals].sort((a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt))) {
      const name = vitalName(v);
      if (seen.has(name)) continue;
      seen.add(name);
      push({ key: `vt-${v.id}`, title: name, meta: `Latest ${formatVitalValue(v)}`, to: recordPath("measurements", v.id), Icon: VitalsIcon }, "measurement reading");
    }
    for (const p of PAGES) push({ key: `pg-${p.to}`, title: p.title, meta: "Page", to: p.to, Icon: ShieldIcon }, p.words);
    return hits;
  }, [allergies, medications, conditions, appointments, documents, immunizations, vitals]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return index
      .filter((h) => words.every((w) => h.haystack.includes(w)))
      // Titles that start with the query rank first.
      .sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)))
      .slice(0, MAX_HITS);
  }, [index, query]);

  const showList = open && query.trim().length > 0;

  function go(hit: Hit) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    navigate(hit.to);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const hit = results[active];
      if (hit) {
        e.preventDefault();
        go(hit);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      <label className="flex min-h-11 w-full cursor-text items-center gap-2 rounded-[0.7rem] border border-mhl-rule bg-mhl-surface px-3.5 text-mhl-faint transition-colors focus-within:border-mhl-accent/60 focus-within:ring-1 focus-within:ring-mhl-accent/30">
        <span className="sr-only">Search your records</span>
        <SearchIcon size={17} />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          placeholder="Search your records"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Delay so a click on a result lands before the list closes.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-mhl-fine text-mhl-ink outline-none placeholder:text-mhl-faint"
        />
      </label>

      {showList && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-30 min-w-[18rem] overflow-hidden rounded-mhl-sm border border-mhl-rule bg-mhl-surface shadow-mhl sm:left-auto sm:w-[22rem]">
          {results.length === 0 ? (
            <p className="px-4 py-3.5 text-mhl-fine text-mhl-muted">Nothing on your record matches "{query.trim()}".</p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Search results" className="max-h-[22rem] overflow-y-auto py-1">
              {results.map((hit, i) => (
                <li
                  key={hit.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(hit)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3.5 py-2.5",
                    i === active ? "bg-mhl-sunk" : "",
                  )}
                >
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
                    <hit.Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-mhl-body font-semibold text-mhl-ink">{hit.title}</span>
                    <span className="block truncate text-mhl-fine text-mhl-muted">{hit.meta}</span>
                  </span>
                  <ChevronRightIcon size={16} className="flex-none text-mhl-faint" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
