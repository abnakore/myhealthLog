/**
 * The condition guide — what Critical mode knows about a condition, as data.
 *
 * Critical mode must work for ANY serious condition on file, not one hard-coded
 * illness. This module maps a condition to its dashboard shape:
 *
 *   • the family it belongs to (respiratory, metabolic, cardiac, …)
 *   • which measurements the person's team watches for it
 *   • a plain-language care plan, built from the family's steady habits
 *   • how "stable" is judged — from the record's own linked readings
 *
 * Matching is keyword-based over the condition's name (and ICD-10 code where
 * present). A condition that matches nothing still gets a complete, honest
 * dashboard: its own linked medications, its own linked readings, its own
 * follow-ups, and a generic care plan. Nothing here is clinical advice — it
 * surfaces what's on the record and phrases it in plain words.
 */
import type { Condition, VitalType, Medication, VitalReading, Appointment } from "@/types/health";
import { vitalStatus } from "@/types/health";

export type ConditionFamily =
  | "respiratory"
  | "metabolic"
  | "cardiac"
  | "renal"
  | "neurological"
  | "musculoskeletal"
  | "hematological"
  | "maternal"
  | "other";

export interface ConditionGuide {
  family: ConditionFamily;
  /** Which measurements this condition's team watches, most important first. */
  watchVitals: VitalType[];
  /** Plain-language steady habits. Always safe, always generic enough to be true. */
  carePlan: string[];
  /** A word for the thing a person reaches for when it gets bad (a reliever
      inhaler, a glucose tablet). Undefined when there isn't a universal one. */
  rescueLabel?: string;
}

interface FamilyRule {
  family: ConditionFamily;
  /** Name keywords, word-bounded and lowercased. */
  keywords: string[];
  /** ICD-10 chapter prefixes, e.g. "J45" for asthma. */
  icd10?: string[];
  watchVitals: VitalType[];
  carePlan: string[];
  rescueLabel?: string;
}

/**
 * The family table. Ordered — first match wins, so more specific rules
 * (e.g. "type 1 diabetes") can sit above general ones ("diabetes") later.
 */
const FAMILY_RULES: FamilyRule[] = [
  {
    family: "respiratory",
    keywords: ["asthma", "copd", "emphysema", "bronchitis", "pulmonary", "respiratory", "lung"],
    icd10: ["j44", "j45", "j43", "j46"],
    watchVitals: ["PEAK_FLOW", "SPO2", "RESPIRATORY_RATE", "PULSE"],
    carePlan: [
      "Take your controller medication every day, even when you feel well",
      "Avoid known triggers: smoke, dust, cold air and pet dander common ones",
      "Keep your reliever inhaler with you and use it as needed",
      "Attend regular check-ups with your care team",
    ],
    rescueLabel: "Reliever inhaler",
  },
  {
    family: "metabolic",
    keywords: ["diabetes", "hyperglyc", "hypoglyc", "insulin"],
    icd10: ["e10", "e11", "e13"],
    watchVitals: ["BLOOD_GLUCOSE", "WEIGHT", "BMI", "BLOOD_PRESSURE"],
    carePlan: [
      "Take your diabetes medication with meals as prescribed",
      "Check your blood sugar as your care team advised",
      "Keep meals steady and stay active in ways you enjoy",
      "Attend regular check-ups, including eye and foot reviews",
    ],
  },
  {
    family: "cardiac",
    keywords: [
      "hypertension",
      "high blood pressure",
      "heart failure",
      "heart disease",
      "cardiac",
      "coronary",
      "angina",
      "arrhythmia",
      "cholesterol",
      "stroke",
    ],
    icd10: ["i10", "i11", "i13", "i20", "i21", "i25", "i48", "i50"],
    watchVitals: ["BLOOD_PRESSURE", "PULSE", "WEIGHT"],
    carePlan: [
      "Take your blood pressure medication every day, even when you feel well",
      "Keep salt moderate and stay active most days",
      "Check your blood pressure regularly and note the numbers",
      "Attend regular check-ups with your care team",
    ],
  },
  {
    family: "renal",
    keywords: ["kidney", "renal", "dialysis", "nephro"],
    icd10: ["n18", "n17"],
    watchVitals: ["BLOOD_PRESSURE", "BLOOD_GLUCOSE", "WEIGHT"],
    carePlan: [
      "Take your medication exactly as prescribed",
      "Keep fluids and salt as your care team advised",
      "Attend every dialysis or clinic appointment",
      "Report swelling or sudden weight change to your care team",
    ],
  },
  {
    family: "neurological",
    keywords: ["epilepsy", "seizure", "parkinson", "multiple sclerosis", "migraine", "neuropathy"],
    watchVitals: ["PAIN", "PULSE", "TEMPERATURE"],
    carePlan: [
      "Take your medication at the same times every day",
      "Keep a note of episodes: when, how long, and what preceded them",
      "Rest well and keep a steady routine",
      "Attend regular check-ups with your care team",
    ],
  },
  {
    family: "musculoskeletal",
    keywords: ["arthritis", "osteoarthritis", "rheumatoid", "joint", "back pain", "osteoporosis"],
    icd10: ["m15", "m16", "m17", "m54"],
    watchVitals: ["PAIN", "WEIGHT"],
    carePlan: [
      "Take pain medication as prescribed, with food",
      "Stay active with gentle movement most days",
      "Protect your joints: warm, don't overreach",
      "Attend physiotherapy and check-ups as scheduled",
    ],
  },
  {
    family: "hematological",
    keywords: ["sickle cell", "anaemia", "anemia", "thalassemia", "haemophilia", "hemophilia", "clot", "dvt"],
    icd10: ["d57", "d50", "d56", "d68", "i26"],
    watchVitals: ["PULSE", "TEMPERATURE", "SPO2", "PAIN"],
    carePlan: [
      "Take your medication and folic acid as prescribed",
      "Drink plenty of fluids and avoid extreme cold or heat",
      "Watch for pain episodes and seek care early",
      "Attend regular check-ups and blood tests",
    ],
  },
  {
    family: "maternal",
    keywords: ["pregnan", "antenatal", "preeclampsia", "pre-eclampsia", "gestational"],
    watchVitals: ["BLOOD_PRESSURE", "WEIGHT", "BLOOD_GLUCOSE"],
    carePlan: [
      "Take your prenatal supplements daily",
      "Attend every antenatal appointment",
      "Watch for swelling, headaches or vision changes and report them",
      "Rest well and stay gently active",
    ],
  },
];

/** Words that make a condition read as serious for the alert line — never used
    for diagnosis, only to keep the hero's wording calm for resolved/mild states. */
export function isActive(c: Condition): boolean {
  return c.status === "ACTIVE";
}

/**
 * The guide for a condition. Exact-name and ICD-10 matches beat loose keyword
 * matches; anything unmatched falls back to a generic family with the record's
 * own linked data carrying the dashboard.
 */
export function guideFor(condition: Condition): ConditionGuide {
  const name = condition.name.toLowerCase();
  const icd = (condition.icd10Code ?? "").toLowerCase();

  // 1. ICD-10 prefix (strongest signal, when present).
  if (icd) {
    for (const rule of FAMILY_RULES) {
      if (rule.icd10?.some((p) => icd.startsWith(p))) return toGuide(rule);
    }
  }
  // 2. Name keywords.
  for (const rule of FAMILY_RULES) {
    if (rule.keywords.some((k) => name.includes(k))) return toGuide(rule);
  }
  // 3. The generic guide — the record's own links do the work.
  return {
    family: "other",
    watchVitals: [],
    carePlan: [
      "Take your medication exactly as prescribed",
      "Keep a note of how you feel each day",
      "Avoid anything you've noticed makes it worse",
      "Attend regular check-ups with your care team",
    ],
  };
}

function toGuide(rule: FamilyRule): ConditionGuide {
  return {
    family: rule.family,
    watchVitals: rule.watchVitals,
    carePlan: rule.carePlan,
    rescueLabel: rule.rescueLabel,
  };
}

/* ------------------------------------------------- record-driven readings -- */

/** A vitals group: its latest reading plus the trail behind it. */
export interface VitalGroup {
  latest: VitalReading;
  values: number[];
}

/** Group vitals by measure (custom readings by their label), latest last. */
export function groupVitals(vitals: VitalReading[]): VitalGroup[] {
  const groups = new Map<string, VitalReading[]>();
  for (const v of vitals) {
    const key = v.vitalType === "CUSTOM" ? `CUSTOM:${(v.label ?? "").trim().toLowerCase()}` : v.vitalType;
    const arr = groups.get(key);
    if (arr) arr.push(v);
    else groups.set(key, [v]);
  }
  const rows = Array.from(groups.values()).map((readings) => {
    const chrono = [...readings].sort((a, b) => +new Date(a.measuredAt) - +new Date(b.measuredAt));
    return { latest: chrono[chrono.length - 1], values: chrono.slice(-16).map((r) => r.value) };
  });
  rows.sort((a, b) => +new Date(b.latest.measuredAt) - +new Date(a.latest.measuredAt));
  return rows;
}

/** The readings a condition watches: linked ones first, then the family's
    watch-list that exist on the record, then the rest — deduped, capped. */
export function conditionReadings(
  condition: Condition,
  guide: ConditionGuide,
  groups: VitalGroup[],
): VitalGroup[] {
  const linked = groups.filter((g) => (g.latest.conditionIds ?? []).includes(condition.id));
  const watchset = new Set(guide.watchVitals);
  const watched = groups.filter(
    (g) => !linked.includes(g) && watchset.has(g.latest.vitalType),
  );
  const rest = groups.filter((g) => !linked.includes(g) && !watchset.has(g.latest.vitalType));
  return [...linked, ...watched, ...rest].slice(0, 5);
}

/** The condition's best number for the hero metric: the family's first watch
    vital that exists on the record, else the most recent linked reading. */
export function headlineReading(
  condition: Condition,
  guide: ConditionGuide,
  groups: VitalGroup[],
): VitalGroup | undefined {
  for (const type of guide.watchVitals) {
    const hit = groups.find((g) => g.latest.vitalType === type);
    if (hit) return hit;
  }
  return groups.find((g) => (g.latest.conditionIds ?? []).includes(condition.id));
}

/** The condition's active medications — linked first, then name-mentioned. */
export function conditionMedications(
  condition: Condition,
  meds: Medication[],
): Medication[] {
  const active = meds.filter((m) => m.active);
  const linked = active.filter((m) => (m.conditionIds ?? []).includes(condition.id));
  if (linked.length > 0) return linked;
  const terms = condition.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const named = active.filter((m) =>
    terms.some((t) => `${m.reason ?? ""} ${m.notes ?? ""}`.toLowerCase().includes(t)),
  );
  return named.length > 0 ? named : active;
}

/** The condition's next follow-up — a linked visit first, then any visit whose
    title names the condition, then any scheduled visit. */
export function conditionFollowUp(
  condition: Condition,
  appointments: Appointment[],
  now = Date.now(),
): Appointment | undefined {
  const upcoming = [...appointments]
    .filter((a) => a.status === "SCHEDULED" && +new Date(a.scheduledFor) >= now)
    .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor));
  return (
    upcoming.find((a) => (a.conditionIds ?? []).includes(condition.id)) ??
    upcoming.find((a) => a.title.toLowerCase().includes(condition.name.toLowerCase().split(" ")[0])) ??
    upcoming[0]
  );
}

/** How the condition is doing, judged only from the record's own numbers:
    any recent out-of-band reading flags "watching", otherwise "steady".
    Never a diagnosis — the words stay humble. */
export function conditionStatus(
  condition: Condition,
  guide: ConditionGuide,
  groups: VitalGroup[],
): { label: "Stable" | "Watch"; detail: string } {
  const recent = conditionReadings(condition, guide, groups).slice(0, 4);
  const flagged = recent.filter((g) => {
    const s = vitalStatus(g.latest);
    return s === "high" || s === "low";
  });
  if (!isActive(condition)) return { label: "Stable", detail: "Settled on your record" };
  if (flagged.length === 0)
    return { label: "Stable", detail: recent.length > 0 ? "No recent flare-ups" : "No readings yet" };
  return {
    label: "Watch",
    detail: `${flagged.length} reading${flagged.length === 1 ? "" : "s"} outside the usual band`,
  };
}
