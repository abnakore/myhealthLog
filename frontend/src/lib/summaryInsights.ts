/**
 * The rule engine behind the medical summary ("Doctor's First 60 Seconds").
 *
 * A summary that only lists the record is a filing cabinet. This module reads
 * the same data a clinician would and decides what they must see *first*:
 *
 *   critical  — act on this before anything else (anaphylaxis risk, a medicine
 *               the person is allergic to, a reading in a danger band,
 *               a critical lab value, a medicine contraindicated in pregnancy)
 *   warning   — abnormal or worth checking (high/low readings, abnormal lab
 *               results, medicine–condition cautions, severe active conditions)
 *   info      — gaps that slow care down (no blood type, no emergency contact,
 *               a visit coming up, a visit left "scheduled" in the past)
 *
 * It is deliberately rule-based and transparent — every flag says which rule
 * raised it — so it is auditable by a clinician.
 * The thresholds are standard adult screening bands; they flag for review and
 * never diagnose.
 *
 * Both the signed-in summary and the public emergency view call this with the
 * same data, so a first responder sees exactly the flags the owner sees.
 */

export type InsightLevel = "critical" | "warning" | "info";

export interface Insight {
  level: InsightLevel;
  title: string;
  detail: string;
  /** Which summary section the flag belongs to (for linking/scrolling). */
  section: "allergies" | "medications" | "conditions" | "readings" | "labs" | "profile" | "appointments";
}

export interface InsightAllergy {
  substance: string;
  severity: string;
  reactions?: string[];
}
export interface InsightCondition {
  name: string;
  status: string;
  severity?: string | null;
}
export interface InsightMedication {
  name: string;
  dosage?: string;
  active?: boolean;
}
export interface InsightReading {
  vitalType: string;
  label?: string;
  value: number;
  value2?: number | null;
  unit?: string;
  measuredAt?: string | null;
}
export interface InsightLabFinding {
  metric: string;
  value: string;
  unit?: string;
  status: string;
  referenceRange?: string;
  source: string;
  date?: string | null;
}
export interface InsightAppointment {
  title: string;
  scheduledFor: string;
  status: string;
}

export interface InsightInput {
  allergies: InsightAllergy[];
  conditions: InsightCondition[];
  medications: InsightMedication[];
  readings: InsightReading[];
  labFindings?: InsightLabFinding[];
  appointments?: InsightAppointment[];
  bloodType?: string | null;
  contactCount?: number;
  pregnant?: boolean;
  /** Skip profile-gap flags (the public view cannot fix them). */
  publicView?: boolean;
}

/* ---------------------------------------------------------- drug classes -- */

/** An allergy to the class name covers every medicine in it. */
const DRUG_CLASSES: Record<string, string[]> = {
  penicillin: [
    "penicillin", "amoxicillin", "amoxil", "ampicillin", "augmentin", "co-amoxiclav",
    "flucloxacillin", "cloxacillin", "piperacillin", "ampiclox", "benzylpenicillin",
  ],
  cephalosporin: ["cef", "cephalexin", "cefalexin", "ceftriaxone", "cefuroxime", "cefixime", "cefpodoxime"],
  sulfonamide: ["sulfa", "sulfamethoxazole", "co-trimoxazole", "septrin", "bactrim", "sulfasalazine", "sulfadoxine", "fansidar"],
  nsaid: ["ibuprofen", "diclofenac", "naproxen", "aspirin", "ketoprofen", "piroxicam", "meloxicam", "celecoxib", "indomethacin", "mefenamic"],
  opioid: ["codeine", "morphine", "tramadol", "pethidine", "oxycodone", "hydrocodone", "fentanyl"],
  quinolone: ["ciprofloxacin", "levofloxacin", "ofloxacin", "moxifloxacin", "norfloxacin"],
  macrolide: ["erythromycin", "azithromycin", "clarithromycin"],
  tetracycline: ["tetracycline", "doxycycline", "minocycline"],
};

/** Words in an allergy's name that point at a class. */
const CLASS_ALIASES: Record<string, string> = {
  penicillin: "penicillin",
  penicillins: "penicillin",
  "beta-lactam": "penicillin",
  amoxicillin: "penicillin",
  cephalosporin: "cephalosporin",
  cephalosporins: "cephalosporin",
  sulfa: "sulfonamide",
  sulpha: "sulfonamide",
  sulfonamide: "sulfonamide",
  sulfonamides: "sulfonamide",
  nsaid: "nsaid",
  nsaids: "nsaid",
  aspirin: "nsaid",
  ibuprofen: "nsaid",
  opioid: "opioid",
  opioids: "opioid",
  codeine: "opioid",
  morphine: "opioid",
  quinolone: "quinolone",
  quinolones: "quinolone",
  fluoroquinolone: "quinolone",
  macrolide: "macrolide",
  tetracycline: "tetracycline",
};

const norm = (s: string) => s.toLowerCase().trim();

function classOfMedicine(name: string): string | null {
  const n = norm(name);
  for (const [cls, members] of Object.entries(DRUG_CLASSES)) {
    if (members.some((m) => n.includes(m))) return cls;
  }
  return null;
}

function allergyClasses(substance: string): string[] {
  const words = norm(substance).split(/[^a-z-]+/).filter(Boolean);
  const classes = new Set<string>();
  for (const w of words) if (CLASS_ALIASES[w]) classes.add(CLASS_ALIASES[w]);
  return [...classes];
}

/** Does taking `medicine` risk a reaction to `allergy`? Returns the reason or null. */
export function allergyConflict(medicine: string, allergy: string): string | null {
  const med = norm(medicine);
  const sub = norm(allergy);
  if (!med || !sub) return null;
  const firstWord = med.split(/\s+/)[0];
  if (sub.length >= 4 && (med.includes(sub) || (firstWord.length >= 4 && sub.includes(firstWord)))) {
    return `${medicine} is the substance on the allergy list`;
  }
  const medClass = classOfMedicine(medicine);
  if (medClass && allergyClasses(allergy).includes(medClass)) {
    return `${medicine} is a ${medClass} and the record lists a ${allergy} allergy`;
  }
  return null;
}

/* ------------------------------------------------- medicine × condition -- */

const KIDNEY = /kidney|renal|ckd|nephr/;
const ULCER = /ulcer|gastritis|gi bleed/;
const HEART_FAILURE = /heart failure|cardiac failure/;
const ASTHMA = /asthma/;

const ACE_ARB = ["lisinopril", "enalapril", "ramipril", "captopril", "perindopril", "losartan", "valsartan", "telmisartan", "candesartan", "irbesartan"];
const STATINS = ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "lovastatin"];
const PREGNANCY_AVOID = ["warfarin", "isotretinoin", "methotrexate", "valproate", "sodium valproate", "misoprostol", "doxycycline", "tetracycline"];

function has(list: string[], name: string) {
  const n = norm(name);
  return list.some((m) => n.includes(m));
}

function medicineConditionCautions(meds: InsightMedication[], conditions: InsightCondition[], pregnant: boolean): Insight[] {
  const out: Insight[] = [];
  const open = conditions.filter((c) => c.status !== "RESOLVED").map((c) => norm(c.name));
  const anyCond = (re: RegExp) => open.some((c) => re.test(c));
  const onWarfarin = meds.some((m) => norm(m.name).includes("warfarin"));

  for (const m of meds) {
    const cls = classOfMedicine(m.name);
    if (cls === "nsaid") {
      if (anyCond(KIDNEY)) out.push(caution(m, "NSAIDs can worsen kidney function. The record lists kidney disease."));
      if (anyCond(ULCER)) out.push(caution(m, "NSAIDs raise the risk of stomach bleeding. The record lists an ulcer/gastritis."));
      if (anyCond(HEART_FAILURE)) out.push(caution(m, "NSAIDs can worsen heart failure."));
      if (anyCond(ASTHMA)) out.push(caution(m, "NSAIDs can trigger bronchospasm in some people with asthma."));
      if (onWarfarin && !norm(m.name).includes("warfarin")) {
        out.push(caution(m, "Taken with warfarin, NSAIDs raise the bleeding risk."));
      }
    }
    if (norm(m.name).includes("metformin") && anyCond(KIDNEY)) {
      out.push(caution(m, "Metformin dosing depends on kidney function. The record lists kidney disease."));
    }
    if (pregnant) {
      if (has(ACE_ARB, m.name)) {
        out.push({
          level: "critical",
          section: "medications",
          title: `${m.name} during pregnancy`,
          detail: "ACE inhibitors and ARBs are generally avoided in pregnancy. Review with the prescriber.",
        });
      } else if (has(STATINS, m.name) || has(PREGNANCY_AVOID, m.name)) {
        out.push({
          level: "critical",
          section: "medications",
          title: `${m.name} during pregnancy`,
          detail: "This medicine is usually avoided in pregnancy. Review with the prescriber.",
        });
      }
    }
  }
  return out;
}

function caution(m: InsightMedication, detail: string): Insight {
  return { level: "warning", section: "medications", title: `Check ${m.name}`, detail };
}

/* -------------------------------------------------------------- readings -- */

type Band = { level: InsightLevel; note: string } | null;

function glucoseMmol(r: InsightReading): number {
  return (r.unit ?? "").toLowerCase().includes("mg") ? r.value / 18 : r.value;
}

function temperatureC(r: InsightReading): number {
  return (r.unit ?? "").toUpperCase().includes("F") ? ((r.value - 32) * 5) / 9 : r.value;
}

/** Standard adult screening bands. */
export function readingBand(r: InsightReading): Band {
  switch (r.vitalType) {
    case "BLOOD_PRESSURE": {
      const sys = r.value;
      const dia = r.value2 ?? 0;
      if (sys >= 180 || dia >= 120) return { level: "critical", note: "in the hypertensive-crisis range (≥180/120)" };
      if (sys < 90) return { level: "warning", note: "low (systolic under 90)" };
      if (sys >= 140 || dia >= 90) return { level: "warning", note: "high (≥140/90)" };
      return null;
    }
    case "SPO2":
      if (r.value < 90) return { level: "critical", note: "dangerously low oxygen (under 90%)" };
      if (r.value < 94) return { level: "warning", note: "below the normal range (under 94%)" };
      return null;
    case "PULSE":
      if (r.value > 150 || r.value < 40) return { level: "critical", note: "far outside the normal heart rate" };
      if (r.value > 110 || r.value < 50) return { level: "warning", note: "outside the normal heart rate (50–110)" };
      return null;
    case "RESPIRATORY_RATE":
      if (r.value > 30 || r.value < 8) return { level: "critical", note: "far outside the normal breathing rate" };
      if (r.value > 24 || r.value < 10) return { level: "warning", note: "outside the normal breathing rate (10–24)" };
      return null;
    case "TEMPERATURE": {
      const c = temperatureC(r);
      if (c >= 40 || c < 35) return { level: "critical", note: c >= 40 ? "a very high fever (≥40 °C)" : "hypothermic (under 35 °C)" };
      if (c >= 38) return { level: "warning", note: "a fever (≥38 °C)" };
      return null;
    }
    case "BLOOD_GLUCOSE": {
      const g = glucoseMmol(r);
      if (g < 3.0) return { level: "critical", note: "severe hypoglycaemia (under 3.0 mmol/L)" };
      if (g > 16.7) return { level: "critical", note: "very high (over 16.7 mmol/L)" };
      if (g < 3.9) return { level: "warning", note: "low (under 3.9 mmol/L)" };
      if (g > 11.0) return { level: "warning", note: "high (over 11 mmol/L)" };
      return null;
    }
    case "PAIN":
      if (r.value >= 7) return { level: "warning", note: "severe pain (7/10 or more)" };
      return null;
    default:
      return null;
  }
}

function readingName(r: InsightReading): string {
  if (r.label) return r.label;
  const map: Record<string, string> = {
    BLOOD_PRESSURE: "Blood pressure",
    SPO2: "Oxygen saturation",
    PULSE: "Pulse",
    RESPIRATORY_RATE: "Breathing rate",
    TEMPERATURE: "Temperature",
    BLOOD_GLUCOSE: "Blood glucose",
    PAIN: "Pain score",
  };
  return map[r.vitalType] ?? r.vitalType.replace(/_/g, " ").toLowerCase();
}

function readingValue(r: InsightReading): string {
  const v = r.value2 !== undefined && r.value2 !== null ? `${r.value}/${r.value2}` : `${r.value}`;
  return r.unit ? `${v} ${r.unit}` : v;
}

/* ------------------------------------------------------------------ main -- */

const ORDER: Record<InsightLevel, number> = { critical: 0, warning: 1, info: 2 };

export function summaryInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const activeMeds = input.medications.filter((m) => m.active !== false);

  // 1. Allergies that can kill, and medicines the person should not be taking.
  for (const a of input.allergies) {
    if (a.severity === "ANAPHYLAXIS" || a.severity === "SEVERE") {
      out.push({
        level: "critical",
        section: "allergies",
        title: a.severity === "ANAPHYLAXIS" ? `Anaphylaxis risk: ${a.substance}` : `Severe allergy: ${a.substance}`,
        detail: a.reactions?.length ? `Reaction: ${a.reactions.join(", ")}.` : "Do not give without checking alternatives.",
      });
    }
  }
  for (const m of activeMeds) {
    for (const a of input.allergies) {
      const why = allergyConflict(m.name, a.substance);
      if (why) {
        out.push({
          level: "critical",
          section: "medications",
          title: `Possible allergy conflict: ${m.name}`,
          detail: `${why}. Confirm with the prescriber.`,
        });
      }
    }
  }

  // 2. Medicine × condition / pregnancy cautions.
  out.push(...medicineConditionCautions(activeMeds, input.conditions, Boolean(input.pregnant)));

  // 3. Latest readings in a danger or abnormal band.
  for (const r of input.readings) {
    const band = readingBand(r);
    if (band) {
      out.push({
        level: band.level,
        section: "readings",
        title: `${readingName(r)} ${readingValue(r)}`,
        detail: `The latest reading is ${band.note}${r.measuredAt ? `, recorded ${new Date(r.measuredAt).toLocaleDateString()}` : ""}.`,
      });
    }
  }

  // 4. Abnormal results read from lab documents.
  for (const f of input.labFindings ?? []) {
    const level: InsightLevel = f.status === "critical" ? "critical" : "warning";
    out.push({
      level,
      section: "labs",
      title: `${f.metric} ${f.value}${f.unit ? ` ${f.unit}` : ""} (${f.status})`,
      detail: `${f.referenceRange ? `Reference ${f.referenceRange}. ` : ""}From ${f.source}${f.date ? `, ${new Date(f.date).toLocaleDateString()}` : ""}.`,
    });
  }

  // 5. Severe conditions that are still active.
  for (const c of input.conditions) {
    if (c.status === "ACTIVE" && c.severity === "SEVERE") {
      out.push({
        level: "warning",
        section: "conditions",
        title: `Severe active condition: ${c.name}`,
        detail: "Marked severe on the record.",
      });
    }
  }
  if (input.pregnant) {
    out.push({
      level: "warning",
      section: "conditions",
      title: "Currently pregnant",
      detail: "Consider pregnancy before prescribing, imaging or procedures.",
    });
  }

  // 6. Gaps and housekeeping — only useful to the owner.
  if (!input.publicView) {
    if (!input.bloodType) {
      out.push({ level: "info", section: "profile", title: "Blood type not recorded", detail: "Add it to your profile. It is the first thing asked in an emergency." });
    }
    if ((input.contactCount ?? 0) === 0) {
      out.push({ level: "info", section: "profile", title: "No emergency contact", detail: "Add someone to call. It appears on your emergency card." });
    }
    if (input.allergies.length === 0) {
      out.push({ level: "info", section: "allergies", title: "No allergies recorded", detail: "If you have none, a clinician will still ask. Add any you know of." });
    }
    const now = Date.now();
    for (const a of input.appointments ?? []) {
      const t = +new Date(a.scheduledFor);
      if (a.status === "SCHEDULED" && t < now) {
        out.push({ level: "info", section: "appointments", title: `Past visit still open: ${a.title}`, detail: "Mark it attended or missed so the record stays accurate." });
      } else if (a.status === "SCHEDULED" && t - now < 7 * 86_400_000) {
        out.push({ level: "info", section: "appointments", title: `Coming up: ${a.title}`, detail: `On ${new Date(a.scheduledFor).toLocaleString()}.` });
      }
    }
  }

  // Most urgent first; stable within a level.
  return out
    .map((insight, i) => ({ insight, i }))
    .sort((a, b) => ORDER[a.insight.level] - ORDER[b.insight.level] || a.i - b.i)
    .map(({ insight }) => insight);
}

/** Rank readings so an abnormal one leads the list. */
export function readingPriority(r: InsightReading): number {
  const band = readingBand(r);
  return band ? ORDER[band.level] : 3;
}

/** Rank conditions: active + severe first, resolved last. */
export function conditionPriority(c: InsightCondition): number {
  if (c.status === "ACTIVE" && c.severity === "SEVERE") return 0;
  if (c.status === "ACTIVE") return 1;
  if (c.status === "IN_REMISSION") return 2;
  return 3;
}
