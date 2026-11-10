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
 * It is deliberately rule-based and transparent, so it is auditable.
 *
 * Medicines: this file has no medicine knowledge of its own. Allergy clashes,
 * contraindications and interactions come from the backend record check, which
 * uses official sources (RxNorm, MED-RT and FDA labels through the US National
 * Library of Medicine and openFDA). They arrive here as `medicineFlags`.
 *
 * Readings: the bands below are the same published thresholds the backend uses
 * (backend apps/core/clinical_rules.py), each cited where it is applied:
 *   ACC/AHA 2017 (blood pressure), ACOG Practice Bulletin 222 (blood pressure in
 *   pregnancy), NEWS2 2017 (pulse, breathing, oxygen, temperature, low blood
 *   pressure), ADA Standards of Care 2025 (low glucose), WHO 2006 (high glucose).
 * They flag for review and never diagnose.
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
/** A serious finding about a current medicine, from the backend record check. */
export interface InsightMedicineFlag {
  medication: string;
  level: "critical" | "warning";
  title: string;
  detail: string;
  source?: string;
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
  /** Medicine findings from the backend record check (official drug sources). */
  medicineFlags?: InsightMedicineFlag[];
  appointments?: InsightAppointment[];
  bloodType?: string | null;
  contactCount?: number;
  pregnant?: boolean;
  /** Skip profile-gap flags (the public view cannot fix them). */
  publicView?: boolean;
}

/* -------------------------------------------------------------- readings -- */

type Band = { level: InsightLevel; note: string } | null;

function glucoseMmol(r: InsightReading): number {
  return (r.unit ?? "").toLowerCase().includes("mg") ? r.value / 18 : r.value;
}

function temperatureC(r: InsightReading): number {
  return (r.unit ?? "").toUpperCase().includes("F") ? ((r.value - 32) * 5) / 9 : r.value;
}

/** Guideline thresholds; the same values as backend clinical_rules.reading_band. */
export function readingBand(r: InsightReading, opts: { pregnant?: boolean } = {}): Band {
  switch (r.vitalType) {
    case "BLOOD_PRESSURE": {
      const sys = r.value;
      const dia = r.value2 ?? 0;
      if (opts.pregnant) {
        // ACOG: severe from 160/110; hypertension from 140/90.
        if (sys >= 160 || dia >= 110) return { level: "critical", note: "in the severe range for pregnancy (160/110 or more)" };
        if (sys >= 140 || dia >= 90) return { level: "warning", note: "high for pregnancy (140/90 or more)" };
      }
      // ACC/AHA: above 180/120 is severe; 140/90 or more is stage 2. NEWS2: systolic 90 or less, 91 to 100.
      if (sys > 180 || dia > 120) return { level: "critical", note: "very high (above 180/120)" };
      if (sys <= 90) return { level: "critical", note: "very low (systolic 90 or less)" };
      if (sys <= 100) return { level: "warning", note: "low (systolic 91 to 100)" };
      if (sys >= 140 || dia >= 90) return { level: "warning", note: "high (140/90 or more)" };
      return null;
    }
    case "SPO2": // NEWS2 scale 1
      if (r.value <= 91) return { level: "critical", note: "dangerously low oxygen (91% or less)" };
      if (r.value <= 93) return { level: "warning", note: "low oxygen (92 to 93%)" };
      return null;
    case "PULSE": // NEWS2
      if (r.value <= 40 || r.value >= 131) return { level: "critical", note: "far outside the normal heart rate" };
      if (r.value >= 111) return { level: "warning", note: "a fast heart rate (111 to 130)" };
      return null;
    case "RESPIRATORY_RATE": // NEWS2
      if (r.value <= 8 || r.value >= 25) return { level: "critical", note: "far outside the normal breathing rate" };
      if (r.value >= 21) return { level: "warning", note: "fast breathing (21 to 24)" };
      return null;
    case "TEMPERATURE": { // NEWS2
      const c = temperatureC(r);
      if (c <= 35) return { level: "critical", note: "very low (35 °C or less)" };
      if (c >= 39.1) return { level: "warning", note: "a high fever (39.1 °C or more)" };
      if (c >= 38.1) return { level: "info", note: "a fever (38.1 to 39 °C)" };
      return null;
    }
    case "BLOOD_GLUCOSE": {
      const g = glucoseMmol(r);
      // ADA: level 2 hypoglycaemia under 3.0, level 1 under 3.9. WHO: 11.1 or more is in the diabetic range.
      if (g < 3.0) return { level: "critical", note: "severe low blood sugar (under 3.0 mmol/L)" };
      if (g < 3.9) return { level: "warning", note: "low blood sugar (under 3.9 mmol/L)" };
      if (g >= 11.1) return { level: "warning", note: "high (11.1 mmol/L or more)" };
      return null;
    }
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

  // 1. Allergies that can kill.
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
  // 2. Medicine findings from the backend record check (official drug sources).
  for (const f of input.medicineFlags ?? []) {
    if (!activeMeds.some((m) => m.name === f.medication)) continue;
    out.push({ level: f.level, section: "medications", title: f.title, detail: f.detail });
  }

  // 3. Latest readings in a danger or abnormal band.
  for (const r of input.readings) {
    const band = readingBand(r, { pregnant: input.pregnant });
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
