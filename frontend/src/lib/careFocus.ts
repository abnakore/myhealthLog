/**
 * Care focus: several conditions and life stages at once, ranked by fixed rules.
 *
 * A person can be pregnant, diabetic and asthmatic at the same time, so the app
 * no longer focuses on one thing only. The focus is a list of references; this
 * module ranks it with the same rules the backend uses (apps/contexts/focus.py),
 * so the dashboard can reorder immediately while the server stays the source
 * of truth for the Copilot and the emergency summary:
 *
 *   pregnancy                      100  changes which medicines and readings are safe
 *   active condition, severe        90
 *   active condition, moderate      75
 *   active condition, no severity   70
 *   active condition, mild          60
 *   condition in remission          40
 *   elderly care                    30  shapes the screens rather than the medicine
 *   resolved condition              20
 *
 * Ties break on name so the order never flickers. The top item decides the
 * dashboard layout (the "primary" mode); the rest still get a place on it.
 */
import type { AppMode } from "@/lib/appModes";

export type FocusKind = "pregnancy" | "condition" | "elderly";

export interface FocusRef {
  kind: FocusKind;
  /** Condition id, for kind "condition" only. */
  id?: string;
}

export interface RankedFocus {
  kind: FocusKind;
  id: string;
  label: string;
  score: number;
  rank: number;
  reason: string;
}

interface FocusCondition {
  id: string;
  name: string;
  status: string;
  severity?: string | null;
}

export const PREGNANCY_SCORE = 100;
export const ELDERLY_SCORE = 30;

export function conditionScore(status: string, severity?: string | null): number {
  const s = (status ?? "").toUpperCase();
  const sev = (severity ?? "").toUpperCase();
  if (s === "ACTIVE") {
    if (sev === "SEVERE") return 90;
    if (sev === "MODERATE") return 75;
    if (sev === "MILD") return 60;
    return 70;
  }
  if (s === "IN_REMISSION") return 40;
  return 20;
}

function conditionReason(c: FocusCondition): string {
  const status =
    c.status === "ACTIVE" ? "Active" : c.status === "IN_REMISSION" ? "In remission" : "Resolved";
  return `${status} condition${c.severity ? `, ${c.severity.toLowerCase()}` : ""}.`;
}

/** Same refs, same record, same order as the server. Dangling condition refs are dropped. */
export function rankFocus(
  refs: FocusRef[],
  conditions: FocusCondition[],
  opts: { pregnancyLabel?: string } = {},
): RankedFocus[] {
  const seen = new Set<string>();
  const items: Omit<RankedFocus, "rank">[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (ref.kind === "pregnancy") {
      items.push({
        kind: "pregnancy",
        id: "",
        label: opts.pregnancyLabel ?? "Pregnancy",
        score: PREGNANCY_SCORE,
        reason: "Pregnancy changes which medicines and readings are safe, so it leads.",
      });
    } else if (ref.kind === "condition") {
      const c = conditions.find((x) => x.id === ref.id);
      if (!c) continue;
      items.push({
        kind: "condition",
        id: c.id,
        label: c.name,
        score: conditionScore(c.status, c.severity),
        reason: conditionReason(c),
      });
    } else if (ref.kind === "elderly") {
      items.push({
        kind: "elderly",
        id: "",
        label: "Elderly care",
        score: ELDERLY_SCORE,
        reason: "Shapes the screens: larger text, fewer choices, medication reminders.",
      });
    }
  }
  items.sort((a, b) => b.score - a.score || a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
  return items.map((item, i) => ({ ...item, rank: i + 1 }));
}

/** The dashboard layout the top focus asks for. */
export function primaryMode(ranked: RankedFocus[]): AppMode {
  const top = ranked[0];
  if (!top) return "standard";
  if (top.kind === "pregnancy") return "pregnancy";
  if (top.kind === "condition") return "critical";
  return "elderly";
}

/** Toggle one item in or out of the focus list. */
export function toggleFocus(refs: FocusRef[], ref: FocusRef): FocusRef[] {
  const same = (r: FocusRef) => r.kind === ref.kind && (r.id ?? "") === (ref.id ?? "");
  return refs.some(same) ? refs.filter((r) => !same(r)) : [...refs, ref];
}

export function hasFocus(refs: FocusRef[], ref: FocusRef): boolean {
  return refs.some((r) => r.kind === ref.kind && (r.id ?? "") === (ref.id ?? ""));
}
