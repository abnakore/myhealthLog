/**
 * Health contexts — the data behind condition-aware profiles.
 *
 * The record itself is never duplicated: a context is a *lens* over records that are
 * already on file. Two kinds of lens exist, and both are stored as one small row in
 * the person's own bundle so a proxy sees the right person's contexts:
 *
 *  • CONDITION — anchored on an existing Condition in the record (`conditionId`).
 *    The lens points at that condition; it never copies it. Asthma, Type 2 diabetes
 *    and High blood pressure are all this kind, and a new condition works with no
 *    code change.
 *
 *  • LIFE_STAGE — a stage of life rather than a diagnosis (pregnancy). It carries a
 *    deliberately small amount of metadata that genuinely *is* the context — dates,
 *    gravidity, complications — and everything else comes from existing records.
 *
 * These shapes mirror what the backend will hold (docs/data-model.md: ConditionMode /
 * ProfileMode), so the store's mutators become API calls later without changing the
 * components that read them.
 */

import type { ID } from "./health";

export type ContextKind = "CONDITION" | "LIFE_STAGE";

/** The life stages the app knows how to frame. Kept as a union so an unknown key can't be stored. */
export type LifeStageKey = "pregnancy";

export type PregnancyStatus = "ONGOING" | "DELIVERED" | "ENDED";

/**
 * The few facts that belong to a pregnancy itself rather than to a generic health
 * record. Everything else about a pregnancy — medications, allergies, bloods, scans,
 * visits — is an existing record type and stays one.
 */
export interface PregnancyContext {
  status: PregnancyStatus;
  /** First day of the last menstrual period (ISO date). Gestational age derives from it. */
  lastMenstrualPeriod?: string;
  /** Clinician-given due date (ISO date); falls back to LMP + 280 days. */
  estimatedDueDate?: string;
  /** Pregnancy number — "this is her third pregnancy". */
  gravida?: number;
  /** Births. */
  para?: number;
  miscarriages?: number;
  stillbirths?: number;
  /** Complications recorded against this pregnancy, one short line each. */
  complications?: string[];
  /** How it ended, when it has — a sentence, not a coded field. */
  delivery?: string;
  notes?: string;
}

export interface HealthContext {
  id: ID;
  kind: ContextKind;
  /** CONDITION contexts: the existing condition this lens is anchored on. Never a copy. */
  conditionId?: ID;
  /** LIFE_STAGE contexts: which stage of life. */
  key?: LifeStageKey;
  /**
   * Further conditions this context also covers. Used by a life-stage context when a
   * diagnosis belongs inside it (gestational diabetes in a pregnancy), and available
   * to a condition context that should pull in a related diagnosis.
   */
  conditionIds?: ID[];
  /** Context-specific data, only where a generic record can't hold it. */
  pregnancy?: PregnancyContext;
  createdAt: string;
  updatedAt?: string;
}

export const PREGNANCY_KEY: LifeStageKey = "pregnancy";

export const CONTEXT_KIND_LABELS: Record<ContextKind, string> = {
  CONDITION: "Condition",
  LIFE_STAGE: "Life stage",
};

export const PREGNANCY_STATUS_LABELS: Record<PregnancyStatus, string> = {
  ONGOING: "Ongoing",
  DELIVERED: "Delivered",
  ENDED: "Ended",
};

/** A new pregnancy context: ongoing, with nothing filled in — the user knows the dates. */
export function emptyPregnancyContext(): PregnancyContext {
  return { status: "ONGOING" };
}
