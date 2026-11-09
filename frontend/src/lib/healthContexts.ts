/**
 * The condition-aware engine.
 *
 * One health record, many lenses. Everything here is pure: bundle + context in, a
 * prioritised *reading* of that same bundle out. Nothing is copied, rewritten or
 * removed, and each surfaced item holds a reference to the original record object —
 * which is the property the whole feature rests on, and which the tests assert.
 *
 * How a record becomes "relevant" (deterministic, and shown in the UI on every row):
 *
 *   LINKED    the record names this condition (or the context covers it) in its own
 *             `conditionIds`. The strongest signal — the user said so.
 *   INHERENT  the context itself makes the category relevant: an active medication,
 *             an allergy and a recent scan are all part of what a pregnancy *is*.
 *             Declared as data in CONTEXT_MAPPINGS, not as `if pregnancy:` branches.
 *   MENTION   the record's own words name the condition ("Review diabetes control").
 *             Surfaced, tagged as a mention, and offered for linking.
 *   RECENT    unlinked, in a category the context follows, inside the window. Shown
 *             as such and offered for linking — never silently promoted to "linked".
 *
 * A record that matches none of these is *not* shown in the profile. That is the
 * whole point: the profile prioritises. It is still on the record, still in Normal
 * Mode, still one click away — `counts.rest` says how many, and the page links to them.
 *
 * Two things this file deliberately does not do: decide anything clinical, and treat
 * relevance as permission. Access is decided by the care-proxy and sharing layers
 * before a bundle reaches here (see lib/emergency.ts for the public case).
 */
import { conditionPriority, readingBand } from "@/lib/summaryInsights";
import { genId } from "@/lib/id";
import { formatDate } from "@/lib/format";
import {
  isCriticalAllergy,
  type Allergy,
  type Appointment,
  type Condition,
  type EmergencyContact,
  type HealthDocument,
  type HealthProfile,
  type Immunization,
  type Medication,
  type Procedure,
  type VitalReading,
} from "@/types/health";
import {
  PREGNANCY_KEY,
  PREGNANCY_STATUS_LABELS,
  type HealthContext,
} from "@/types/context";

/* ------------------------------------------------------- the record source -- */

/** The whole record, as the store exposes it — every collection, plus the lenses. */
export interface ContextRecordSource {
  profile: HealthProfile;
  allergies: Allergy[];
  medications: Medication[];
  conditions: Condition[];
  appointments: Appointment[];
  documents: HealthDocument[];
  immunizations: Immunization[];
  procedures: Procedure[];
  vitals: VitalReading[];
  /** Absent on records stored before condition-aware profiles existed. */
  contexts?: HealthContext[];
}

/**
 * The contexts on file for a record. A bundle written before this feature existed has
 * no `contexts` key at all — that is a valid record with no profiles, not an error.
 */
export function contextsOf(bundle: Partial<ContextRecordSource> | undefined): HealthContext[] {
  return Array.isArray(bundle?.contexts) ? bundle.contexts : [];
}

export function findContext(
  contexts: HealthContext[],
  id: string | undefined,
): HealthContext | undefined {
  if (!id) return undefined;
  return contexts.find((c) => c.id === id);
}

/* ------------------------------------------------------ pregnancy maths -- */

export const DAY_MS = 86_400_000;
/** A term pregnancy is dated 280 days from the first day of the last period. */
export const PREGNANCY_DAYS = 280;

function toLocalDate(value: string | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The dating anchor: the LMP if it's known, otherwise the due date minus 280 days. */
export function datingAnchor(ctx: HealthContext): Date | null {
  const p = ctx.pregnancy;
  if (!p) return null;
  const lmp = toLocalDate(p.lastMenstrualPeriod);
  if (lmp) return lmp;
  const edd = toLocalDate(p.estimatedDueDate);
  if (!edd) return null;
  return new Date(edd.getTime() - PREGNANCY_DAYS * DAY_MS);
}

/** The due date on file, or the one the dating implies. */
export function dueDateOf(ctx: HealthContext): string | undefined {
  const p = ctx.pregnancy;
  if (!p) return undefined;
  if (p.estimatedDueDate) return p.estimatedDueDate;
  const anchor = datingAnchor(ctx);
  if (!anchor) return undefined;
  return isoDay(new Date(anchor.getTime() + PREGNANCY_DAYS * DAY_MS));
}

export interface GestationalAge {
  days: number;
  weeks: number;
  /** Days past the last whole week — the "3" in "24 weeks 3 days". */
  rem: number;
  trimester: 1 | 2 | 3;
}

/** Gestational age on a given day, from the record's own dates. Null if undated. */
export function gestationalAgeOf(ctx: HealthContext, at: Date = new Date()): GestationalAge | null {
  const anchor = datingAnchor(ctx);
  if (!anchor) return null;
  const days = Math.floor((at.getTime() - anchor.getTime()) / DAY_MS);
  if (days < 0) return null;
  const weeks = Math.floor(days / 7);
  return { days, weeks, rem: days % 7, trimester: weeks < 14 ? 1 : weeks < 28 ? 2 : 3 };
}

export const TRIMESTER_LABELS: Record<1 | 2 | 3, string> = {
  1: "First trimester",
  2: "Second trimester",
  3: "Third trimester",
};

/* --------------------------------------------------- what a context reads -- */

export type RecordCategory =
  | "medications"
  | "allergies"
  | "vitals"
  | "documents"
  | "appointments"
  | "procedures"
  | "immunizations"
  | "conditions";

/** Every category a profile can show, in the order a clinician reads them. */
export const CATEGORY_ORDER: RecordCategory[] = [
  "conditions",
  "medications",
  "allergies",
  "vitals",
  "documents",
  "appointments",
  "procedures",
  "immunizations",
];

export type RelevanceBasis = "LINKED" | "INHERENT" | "MENTION" | "RECENT";

/** How a basis reads on screen — the why, in the user's words. */
export const BASIS_LABELS: Record<RelevanceBasis, string> = {
  LINKED: "Linked",
  INHERENT: "In this context",
  MENTION: "Mentioned",
  RECENT: "Recent",
};

/**
 * One rule about a category. `basis` is what the row will say about itself, so the
 * profile never claims a record belongs to a condition when nobody said so.
 */
interface ContextRule {
  category: RecordCategory;
  basis: "INHERENT" | "RECENT";
  /** Only surface records dated inside this window. Omitted = any date. */
  windowDays?: number;
  /** Only "still true" records — a medication you're taking now, not one you stopped. */
  currentOnly?: boolean;
}

/**
 * The mapping table. This is the "condition → relevant categories" layer the brief
 * asks for, as data: a new condition needs no entry at all (it gets the default
 * condition rules), and a new kind of context is one entry. Nothing here says a
 * condition *has* any particular record — only which categories it reads.
 */
export interface ContextMapping {
  /** Shown on the profile so the priority rules are stated, not implied. */
  summary: string;
  rules: ContextRule[];
}

export const CONDITION_MAPPING: ContextMapping = {
  summary:
    "Records you've linked to this condition lead. Records whose own words name it follow, marked as mentions you can confirm. Nothing else is promoted: an unlinked record stays exactly where it is.",
  // Deliberately no category rules. A condition claims only what it was told about —
  // an explicit link, or the record naming it. Recent-but-unrelated records are NOT
  // pulled in: that would be the profile inventing a relationship. A future kind of
  // context (or a clinician-configured one) can switch rules on per category; the
  // pregnancy mapping below is the working example.
  rules: [],
};

export const PREGNANCY_MAPPING: ContextMapping = {
  summary:
    "Everything a pregnancy genuinely needs is already on the record: current medicines, allergies, recent bloods and scans, and the visits around them. Older history stays on the record, out of the way of the months that matter.",
  rules: [
    { category: "medications", basis: "INHERENT", currentOnly: true },
    { category: "allergies", basis: "INHERENT" },
    { category: "vitals", basis: "INHERENT", windowDays: 400 },
    { category: "documents", basis: "INHERENT", windowDays: 400 },
    { category: "appointments", basis: "INHERENT", windowDays: 400 },
    { category: "procedures", basis: "INHERENT", windowDays: 400 },
    { category: "immunizations", basis: "INHERENT", windowDays: 400 },
    { category: "conditions", basis: "INHERENT" },
  ],
};

export function mappingFor(ctx: HealthContext): ContextMapping {
  return isPregnancy(ctx) ? PREGNANCY_MAPPING : CONDITION_MAPPING;
}

/* ------------------------------------------------- reading a record's words -- */

/**
 * Words that carry no diagnostic weight on their own, so a condition named with them
 * doesn't start matching half the record. "Type 2 diabetes" is matched on "diabetes";
 * "Chronic kidney disease" falls back to its full name rather than matching "disease".
 */
const QUALIFIERS = new Set([
  "type", "high", "low", "chronic", "acute", "stage", "mild", "moderate", "severe",
  "disease", "syndrome", "disorder", "primary", "secondary", "and", "the", "of",
  "in", "on", "left", "right", "with", "without", "blood", "level", "levels", "no",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The words a mention test uses: the name's own words, minus the generic ones. */
export function matchTerms(name: string): string[] {
  const words = normalize(name).split(" ").filter(Boolean);
  const distinctive = words.filter((w) => !QUALIFIERS.has(w) && w.length >= 4);
  return distinctive.length > 0 ? distinctive : words.filter((w) => w.length >= 4);
}

/**
 * True when the record's own words name the condition. Word-bounded, so "diabetes"
 * matches "diabetes" and "Diabetes review" but never "prediabetes". When a name
 * reduces to nothing distinctive, the whole name has to appear.
 */
export function mentionsName(text: string, name: string): boolean {
  const haystack = normalize(text);
  if (!haystack || !name.trim()) return false;
  const terms = matchTerms(name);
  if (terms.length === 0) return haystack.includes(normalize(name));
  if (terms.some((t) => new RegExp(`(^|[^a-z0-9])${t}`).test(haystack))) return true;
  // The markers and medicines a clinician reads as "about" the condition.
  return clinicalSynonyms(name).some((t) => new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(haystack));
}

/**
 * Words that mean a record is about a condition even when it never names it —
 * an HbA1c report is a diabetes record, lisinopril is a blood-pressure medicine.
 * Declared as data, kept short and conservative; a match still shows as
 * "Mentioned", never as a link the user made.
 */
const CLINICAL_SYNONYMS: [RegExp, string[]][] = [
  [/diabet/, ["hba1c", "glucose", "glycaemic", "glycemic", "metformin", "insulin", "glibenclamide", "gliclazide", "sitagliptin"]],
  [/hypertens|blood pressure/, ["blood pressure", "amlodipine", "lisinopril", "losartan", "nifedipine", "hydrochlorothiazide", "ramipril", "enalapril"]],
  [/asthma/, ["salbutamol", "inhaler", "peak flow", "budesonide", "montelukast"]],
  [/kidney|renal|ckd/, ["egfr", "creatinine", "urea", "potassium", "nephrology"]],
  [/sickle/, ["hydroxyurea", "hydroxycarbamide", "haemoglobin", "hemoglobin", "folic acid"]],
  [/hiv/, ["antiretroviral", "tenofovir", "dolutegravir", "cd4", "viral load"]],
  [/cholesterol|lipid/, ["cholesterol", "ldl", "atorvastatin", "rosuvastatin", "simvastatin"]],
];

function clinicalSynonyms(name: string): string[] {
  const n = normalize(name);
  return CLINICAL_SYNONYMS.filter(([re]) => re.test(n)).flatMap(([, words]) => words.map(normalize));
}

/** What the AI read from a record's attached file, as plain text. */
function extractedText(r: Record<string, unknown>): string {
  const x = r.aiExtraction as
    | {
        summary?: string;
        title?: string;
        conditions_mentioned?: string[];
        key_findings?: { metric?: string }[];
        medications_mentioned?: { name?: string }[];
        follow_up?: string[];
      }
    | null
    | undefined;
  if (!x) return "";
  return [
    x.title,
    x.summary,
    ...(x.conditions_mentioned ?? []),
    ...(x.key_findings ?? []).map((f) => f.metric),
    ...(x.medications_mentioned ?? []).map((m) => m.name),
    ...(x.follow_up ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

/** The free text a record of each category carries — what a mention is read from. */
export function recordText(category: RecordCategory, record: unknown): string {
  const r = record as Record<string, unknown>;
  const str = (...keys: string[]) =>
    [
      ...keys.map((k) => r[k]).filter((v): v is string => typeof v === "string" && v.length > 0),
      // A record's attached file speaks for it too.
      extractedText(r),
    ].join(" ");
  switch (category) {
    case "medications":
      return str("name", "reason", "notes", "prescriber");
    case "allergies":
      return str("substance", "notes");
    case "vitals":
      return str("label", "context");
    case "documents":
      return str("title", "notes", "labName", "findings", "bodyArea");
    case "appointments":
      return str("title", "reason", "notes", "facility");
    case "procedures":
      return str("name", "outcome", "notes", "facility");
    case "immunizations":
      return str("vaccine", "notes");
    case "conditions":
      return str("name", "notes");
  }
}

/** The date a record of each category is judged by, for the recency window. */
export function recordDate(category: RecordCategory, record: unknown): string | undefined {
  const r = record as Record<string, unknown>;
  const first = (...keys: string[]) =>
    keys.map((k) => r[k]).find((v): v is string => typeof v === "string" && v.length > 0);
  switch (category) {
    case "medications":
      return first("endDate", "startDate");
    case "allergies":
      return first("firstReactionDate");
    case "vitals":
      return first("measuredAt");
    case "documents":
      return first("documentDate", "uploadedAt");
    case "appointments":
      return first("scheduledFor");
    case "procedures":
      return first("performedOn");
    case "immunizations":
      return first("administeredOn");
    case "conditions":
      return first("resolvedDate", "onsetDate");
  }
}


/**
 * The lens for a condition already on file. Anchored on the condition's own id — the
 * context adds nothing to the record except the fact that the user is looking at it
 * this way, so creating one never touches a clinical field.
 */
export function conditionContext(condition: Condition, existing?: HealthContext): HealthContext {
  return {
    id: existing?.id ?? genId("ctx"),
    kind: "CONDITION",
    conditionId: condition.id,
    // Only present when there is something to add: the row stays a bare anchor.
    ...(existing?.conditionIds ? { conditionIds: existing.conditionIds } : {}),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** The pregnancy lens. One per record: a person is pregnant once, not three times over. */
export function pregnancyContext(existing?: HealthContext): HealthContext {
  return {
    id: existing?.id ?? genId("ctx"),
    kind: "LIFE_STAGE",
    key: PREGNANCY_KEY,
    conditionIds: existing?.conditionIds ?? [],
    pregnancy: existing?.pregnancy ?? { status: "ONGOING" },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function isPregnancy(ctx: HealthContext | undefined): boolean {
  return ctx?.kind === "LIFE_STAGE" && ctx.key === PREGNANCY_KEY;
}

export function findPregnancy(contexts: HealthContext[]): HealthContext | undefined {
  return contexts.find(isPregnancy);
}

/** The condition ids a context covers: its anchor, plus any further conditions. */
export function contextConditionIds(ctx: HealthContext): string[] {
  const ids = [...(ctx.conditionIds ?? [])];
  if (ctx.conditionId && !ids.includes(ctx.conditionId)) ids.unshift(ctx.conditionId);
  return ids;
}

/** The name to show for a context — the condition's own name, never a re-typed label. */
export function contextLabel(ctx: HealthContext, conditions: Condition[]): string {
  if (isPregnancy(ctx)) return "Pregnancy";
  const anchor = conditions.find((c) => c.id === ctx.conditionId);
  if (anchor) return anchor.name;
  const first = conditions.find((c) => contextConditionIds(ctx).includes(c.id));
  return first?.name ?? "Health context";
}
/* -------------------------------------------------------- the profile shape -- */

export interface Prioritized<T> {
  /** The original record, by reference. Never a copy — the profile is a reading. */
  record: T;
  basis: RelevanceBasis;
  /** True when this record isn't linked to the context yet, so the UI can offer to link it. */
  linkable: boolean;
}

export interface ContextEvent {
  category: RecordCategory;
  id: string;
  date: string;
  basis: RelevanceBasis;
}

export interface CriticalFacts {
  bloodType?: string;
  genotype?: string;
  /** Severe and anaphylactic allergies only — the ones a responder must know. */
  allergies: Allergy[];
  currentMedications: Medication[];
  primaryContact?: EmergencyContact;
}

export interface PregnancyView {
  statusLabel: string;
  dueDate?: string;
  dueDateLabel?: string;
  lastMenstrualPeriod?: string;
  lastMenstrualPeriodLabel?: string;
  age?: GestationalAge;
  ageLabel?: string;
  trimesterLabel?: string;
  gravida?: number;
  para?: number;
  miscarriages?: number;
  stillbirths?: number;
  complications: string[];
  delivery?: string;
  notes?: string;
}

export interface ContextProfile {
  ctx: HealthContext;
  kind: HealthContext["kind"];
  label: string;
  /** CONDITION contexts: the condition this lens is anchored on. */
  anchor?: Condition;
  /** LIFE_STAGE contexts: the dated pregnancy facts, when there are any. */
  pregnancy?: PregnancyView;
  /** The conditions this profile covers or has surfaced, anchor first. */
  relatedConditions: Condition[];
  conditions: Prioritized<Condition>[];
  medications: Prioritized<Medication>[];
  allergies: Prioritized<Allergy>[];
  vitals: Prioritized<VitalReading>[];
  documents: Prioritized<HealthDocument>[];
  appointments: Prioritized<Appointment>[];
  procedures: Prioritized<Procedure>[];
  immunizations: Prioritized<Immunization>[];
  /** Surfaced records, newest first — this context's own timeline. */
  events: ContextEvent[];
  critical: CriticalFacts;
  counts: {
    /** How many records the profile is showing. */
    shown: number;
    /** How many records the person has in total. */
    total: number;
    linked: number;
    /** Records the profile is *not* showing — still on the record, one click away. */
    rest: number;
  };
}

/* ------------------------------------------------------------- the builder -- */

export interface BuildProfileArgs {
  bundle: ContextRecordSource;
  ctx: HealthContext;
  /** "Now" is injected so the tests, and the page, agree on what "recent" means. */
  now?: Date;
}

interface Candidate {
  basis: RelevanceBasis;
  linkable: boolean;
}

/** Anything that can carry the condition link. */
interface Linkable {
  id: string;
  conditionIds?: string[];
}

function classify(args: {
  record: Linkable;
  category: RecordCategory;
  coveredIds: string[];
  names: string[];
  rule: ContextRule | undefined;
  now: Date;
}): Candidate | null {
  const { record, category, coveredIds, names, rule, now } = args;
  // Linking a record means pointing it at a condition on file. A context that covers no
  // condition — a pregnancy, before any diagnosis is attached to it — has nothing to
  // point at, so its rows are shown without a link action.
  const linkable = coveredIds.length > 0;

  // 1. The user said so. Nothing outranks an explicit link.
  const linked = (record.conditionIds ?? []).some((id) => coveredIds.includes(id));
  if (linked) return { basis: "LINKED", linkable: false };

  // 2. The record's own words name the condition. Surfaced, but never called "linked".
  const text = recordText(category, record);
  if (names.some((n) => mentionsName(text, n))) return { basis: "MENTION", linkable };

  // 3. The context's own category rules — declared as data, not as branches per disease.
  if (!rule) return null;
  if (rule.currentOnly && (record as { active?: boolean }).active !== true) return null;
  const date = recordDate(category, record);
  if (!isWithin(date, now, rule.windowDays)) return null;
  return { basis: rule.basis, linkable };
}

const BASIS_RANK: Record<RelevanceBasis, number> = {
  LINKED: 0,
  INHERENT: 1,
  MENTION: 2,
  RECENT: 3,
};

/**
 * How clinically urgent one record is, 0 = most. Inside a profile the dangerous
 * things lead: an anaphylactic allergy before a mild one, a reading in a danger
 * band before a normal one, a lab report with abnormal results before a clean
 * one, a medicine being taken before one that was stopped.
 */
export function clinicalUrgency(category: RecordCategory, record: unknown): number {
  const r = record as Record<string, unknown>;
  switch (category) {
    case "allergies":
      return r.severity === "ANAPHYLAXIS" ? 0 : r.severity === "SEVERE" ? 1 : 2;
    case "conditions":
      return conditionPriority({ name: String(r.name ?? ""), status: String(r.status ?? ""), severity: r.severity as string | undefined });
    case "medications":
      return r.active === false ? 3 : 1;
    case "vitals": {
      const band = readingBand({
        vitalType: String(r.vitalType ?? ""),
        value: Number(r.value),
        value2: r.value2 as number | undefined,
        unit: r.unit as string | undefined,
      });
      return band ? (band.level === "critical" ? 0 : 1) : 2;
    }
    case "documents": {
      const findings = ((r.aiExtraction as { key_findings?: { status?: string | null }[] } | null)?.key_findings) ?? [];
      if (findings.some((f) => f.status === "critical")) return 0;
      if (findings.some((f) => f.status === "high" || f.status === "low")) return 1;
      return 2;
    }
    case "appointments": {
      const when = +new Date(String(r.scheduledFor ?? ""));
      return r.status === "SCHEDULED" && when >= Date.now() ? 1 : 2;
    }
    default:
      return 2;
  }
}

function byPriorityThenDate<T>(category: RecordCategory) {
  return (a: Prioritized<T>, b: Prioritized<T>): number => {
    const urgency = clinicalUrgency(category, a.record) - clinicalUrgency(category, b.record);
    if (urgency !== 0) return urgency;
    const rank = BASIS_RANK[a.basis] - BASIS_RANK[b.basis];
    if (rank !== 0) return rank;
    return (
      +new Date(recordDate(category, b.record) ?? 0) - +new Date(recordDate(category, a.record) ?? 0)
    );
  };
}

/**
 * Read the whole record through one context. Pure: the bundle is only ever read, and
 * every item in the result points back at the record it came from.
 */
export function buildContextProfile({ bundle, ctx, now = new Date() }: BuildProfileArgs): ContextProfile {
  const conditions = bundle.conditions ?? [];
  const coveredIds = contextConditionIds(ctx);
  const names = conditions.filter((c) => coveredIds.includes(c.id)).map((c) => c.name);
  const mapping = mappingFor(ctx);
  const ruleOf = (category: RecordCategory) => mapping.rules.find((r) => r.category === category);

  const pick = <T extends Linkable>(category: RecordCategory, list: T[] | undefined): Prioritized<T>[] =>
    (list ?? [])
      .map((record) => {
        const c = classify({ record, category, coveredIds, names, rule: ruleOf(category), now });
        return c ? { record, basis: c.basis, linkable: c.linkable } : null;
      })
      .filter((p): p is Prioritized<T> => p !== null)
      .sort(byPriorityThenDate<T>(category));

  const conditionsShown = pick("conditions", conditions);
  const medications = pick("medications", bundle.medications);
  const allergies = pick("allergies", bundle.allergies);
  const vitals = pick("vitals", bundle.vitals);
  const documents = pick("documents", bundle.documents);
  const appointments = pick("appointments", bundle.appointments);
  const procedures = pick("procedures", bundle.procedures);
  const immunizations = pick("immunizations", bundle.immunizations);

  const shown = [
    conditionsShown,
    medications,
    allergies,
    vitals,
    documents,
    appointments,
    procedures,
    immunizations,
  ].reduce((n, list) => n + list.length, 0);

  const total =
    conditions.length +
    (bundle.medications?.length ?? 0) +
    (bundle.allergies?.length ?? 0) +
    (bundle.vitals?.length ?? 0) +
    (bundle.documents?.length ?? 0) +
    (bundle.appointments?.length ?? 0) +
    (bundle.procedures?.length ?? 0) +
    (bundle.immunizations?.length ?? 0);

  const anchor = conditions.find((c) => c.id === ctx.conditionId);
  const related = [
    ...(anchor ? [anchor] : []),
    ...conditionsShown.map((p) => p.record),
    ...conditions.filter((c) => coveredIds.includes(c.id)),
  ].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

  const contacts = [...(bundle.profile?.emergencyContacts ?? [])].sort(
    (a, b) => a.priority - b.priority,
  );

  return {
    ctx,
    kind: ctx.kind,
    label: contextLabel(ctx, conditions),
    anchor,
    pregnancy: isPregnancy(ctx) ? pregnancyView(ctx, now) : undefined,
    relatedConditions: related,
    conditions: conditionsShown,
    medications,
    allergies,
    vitals,
    documents,
    appointments,
    procedures,
    immunizations,
    events: surfacedEvents({
      conditions: conditionsShown,
      medications,
      allergies,
      vitals,
      documents,
      appointments,
      procedures,
      immunizations,
    }),
    critical: {
      bloodType: bundle.profile?.bloodType,
      genotype: bundle.profile?.genotype,
      allergies: bundle.allergies.filter((a) => isCriticalAllergy(a.severity)),
      currentMedications: bundle.medications.filter((m) => m.active),
      primaryContact: contacts[0],
    },
    counts: {
      shown,
      total,
      linked: [
        conditionsShown,
        medications,
        allergies,
        vitals,
        documents,
        appointments,
        procedures,
        immunizations,
      ]
        .flat()
        .filter((p) => p.basis === "LINKED").length,
      rest: Math.max(0, total - shown),
    },
  };
}

function isWithin(date: string | undefined, at: Date, days: number | undefined): boolean {
  if (days === undefined) return true;
  const parsed = toLocalDate(date);
  if (!parsed) return false;
  const diff = (at.getTime() - parsed.getTime()) / DAY_MS;
  // A month of slack for a record dated slightly ahead (a scan booked, a dose due).
  return diff >= -31 && diff <= days;
}

/* -------------------------------------------------------------- pregnancy -- */

/** "26 weeks 2 days" — how a gestation is said out loud. */
export function gestationLabel(age: GestationalAge): string {
  const w = `${age.weeks} week${age.weeks === 1 ? "" : "s"}`;
  if (age.rem === 0) return w;
  return `${w} ${age.rem} day${age.rem === 1 ? "" : "s"}`;
}

/** The dated facts of a pregnancy, as the profile and the emergency view show them. */
export function pregnancyView(ctx: HealthContext, now: Date = new Date()): PregnancyView {
  const p = ctx.pregnancy ?? { status: "ONGOING" as const };
  // Weeks only count while the pregnancy is ongoing: after delivery the dates on file
  // can't say how long it lasted, so we don't keep counting forward from them.
  const age = p.status === "ONGOING" ? gestationalAgeOf(ctx, now) : null;
  const due = dueDateOf(ctx);
  return {
    statusLabel: PREGNANCY_STATUS_LABELS[p.status] ?? "Ongoing",
    dueDate: due,
    dueDateLabel: due ? formatDate(due) : undefined,
    lastMenstrualPeriod: p.lastMenstrualPeriod,
    lastMenstrualPeriodLabel: p.lastMenstrualPeriod ? formatDate(p.lastMenstrualPeriod) : undefined,
    age: age ?? undefined,
    ageLabel: age ? gestationLabel(age) : undefined,
    trimesterLabel: age ? TRIMESTER_LABELS[age.trimester] : undefined,
    gravida: p.gravida,
    para: p.para,
    miscarriages: p.miscarriages,
    stillbirths: p.stillbirths,
    complications: p.complications ?? [],
    delivery: p.delivery,
    notes: p.notes,
  };
}

/** "26 weeks 2 days · due 12 Jan 2027" — one line, for a banner or a summary. */
export function pregnancyLine(view: PregnancyView): string {
  return [view.ageLabel ? `${view.ageLabel} pregnant` : null, view.dueDateLabel ? `due ${view.dueDateLabel}` : null]
    .filter(Boolean)
    .join("  ·  ");
}

/* --------------------------------------------------------------- helpers -- */

/**
 * Every surfaced record, newest first, tagged with the category it came from — the
 * context's own timeline. Titles are the UI's job; this is the ordering.
 */
export function surfacedEvents(lists: {
  conditions: Prioritized<Condition>[];
  medications: Prioritized<Medication>[];
  allergies: Prioritized<Allergy>[];
  vitals: Prioritized<VitalReading>[];
  documents: Prioritized<HealthDocument>[];
  appointments: Prioritized<Appointment>[];
  procedures: Prioritized<Procedure>[];
  immunizations: Prioritized<Immunization>[];
}): ContextEvent[] {
  const out: ContextEvent[] = [];
  for (const category of CATEGORY_ORDER) {
    for (const item of lists[category]) {
      const date = recordDate(category, item.record);
      if (!date) continue;
      out.push({ category, id: item.record.id, date, basis: item.basis });
    }
  }
  return out.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

/** How many records on the whole record already name a set of conditions. */
export function linkedRecordCount(
  bundle: Partial<ContextRecordSource>,
  conditionIds: string[],
): number {
  const lists: Array<Array<Linkable> | undefined> = [
    bundle.conditions,
    bundle.medications,
    bundle.allergies,
    bundle.vitals,
    bundle.documents,
    bundle.appointments,
    bundle.procedures,
    bundle.immunizations,
  ];
  return lists.reduce(
    (n, list) =>
      n +
      (list ?? []).filter((r) => (r.conditionIds ?? []).some((id) => conditionIds.includes(id)))
        .length,
    0,
  );
}

/** The context anchored on a condition, if one has been opened. */
export function contextForCondition(
  contexts: HealthContext[],
  conditionId: string,
): HealthContext | undefined {
  return contexts.find((c) => c.conditionId === conditionId);
}

/**
 * One line naming the context that is shaping a record — for the emergency view and
 * the clinical summary. It says *what the owner is currently focused on*; it never
 * carries a record the owner hasn't already chosen to share.
 */
export function contextHeadline(
  ctx: HealthContext,
  conditions: Condition[],
  now: Date = new Date(),
): { label: string; detail?: string } {
  const label = contextLabel(ctx, conditions);
  if (!isPregnancy(ctx)) return { label };
  const line = pregnancyLine(pregnancyView(ctx, now));
  return { label, detail: line || undefined };
}

