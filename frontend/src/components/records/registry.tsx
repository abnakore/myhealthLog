/**
 * The record-kind registry — the single source of truth for the unified Add page
 * (1.3a). Each kind ties its tile (label, blurb, icon) to where it lives (collection
 * key + list page) and its form spec (empty draft, validator, builder, field group).
 * Adding a new record type is one entry here, no new page. `defineKind` keeps each
 * entry checked against its own draft/record types; the returned list is type-erased
 * so the Add page can hold "the current kind" without a giant union.
 */
import type { ComponentType } from "react";
import type { CollectionKey } from "@/store/RecordsContext";
import type { FieldErrors } from "./model";
import * as M from "./model";
import {
  AllergyFields,
  AppointmentFields,
  ConditionFields,
  DocumentFields,
  ImmunizationFields,
  MedicationFields,
} from "./FieldSets";
import {
  AllergyIcon,
  CalendarIcon,
  ConditionIcon,
  DocumentIcon,
  PillIcon,
  ScanIcon,
  VaccineIcon,
} from "@/components/icons";

export type RecordKind =
  | "medication"
  | "allergy"
  | "condition"
  | "visit"
  | "lab"
  | "imaging"
  | "vaccination";

type TileIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export interface FieldSetComponentProps<D> {
  draft: D;
  onChange: (patch: Partial<D>) => void;
  errors: FieldErrors;
}

/** The erased shape the Add page consumes — draft/record are opaque at this boundary. */
export interface KindConfig {
  kind: RecordKind;
  label: string;
  blurb: string;
  icon: TileIcon;
  collectionKey: CollectionKey;
  listPath: string;
  listLabel: string;
  empty: () => unknown;
  validate: (draft: unknown) => FieldErrors;
  fromDraft: (draft: unknown) => unknown;
  Fields: ComponentType<FieldSetComponentProps<unknown>>;
}

/** Typed builder: infers the draft type D from `empty`/`Fields`/`validate`, checks the
    whole entry against it, then erases on return. */
function defineKind<D, R>(config: {
  kind: RecordKind;
  label: string;
  blurb: string;
  icon: TileIcon;
  collectionKey: CollectionKey;
  listPath: string;
  listLabel: string;
  empty: () => D;
  validate: (draft: D) => FieldErrors;
  fromDraft: (draft: D) => R;
  Fields: ComponentType<FieldSetComponentProps<D>>;
}): KindConfig {
  return config as unknown as KindConfig;
}

export const RECORD_KINDS: KindConfig[] = [
  defineKind({
    kind: "medication",
    label: "Medication",
    blurb: "Something you take",
    icon: PillIcon,
    collectionKey: "medications",
    listPath: "/app/medications",
    listLabel: "Medications",
    empty: M.emptyMedicationDraft,
    validate: M.validateMedication,
    fromDraft: (d) => M.medicationFromDraft(d),
    Fields: MedicationFields,
  }),
  defineKind({
    kind: "allergy",
    label: "Allergy",
    blurb: "A reaction to avoid",
    icon: AllergyIcon,
    collectionKey: "allergies",
    listPath: "/app/allergies",
    listLabel: "Allergies",
    empty: M.emptyAllergyDraft,
    validate: M.validateAllergy,
    fromDraft: (d) => M.allergyFromDraft(d),
    Fields: AllergyFields,
  }),
  defineKind({
    kind: "condition",
    label: "Condition",
    blurb: "An ongoing diagnosis",
    icon: ConditionIcon,
    collectionKey: "conditions",
    listPath: "/app/conditions",
    listLabel: "Conditions",
    empty: M.emptyConditionDraft,
    validate: M.validateCondition,
    fromDraft: (d) => M.conditionFromDraft(d),
    Fields: ConditionFields,
  }),
  defineKind({
    kind: "visit",
    label: "Visit",
    blurb: "A past or upcoming appointment",
    icon: CalendarIcon,
    collectionKey: "appointments",
    listPath: "/app/appointments",
    listLabel: "Appointments",
    empty: M.emptyAppointmentDraft,
    validate: M.validateAppointment,
    fromDraft: (d) => M.appointmentFromDraft(d),
    Fields: AppointmentFields,
  }),
  defineKind({
    kind: "lab",
    label: "Lab result",
    blurb: "Blood work, test results",
    icon: DocumentIcon,
    collectionKey: "documents",
    listPath: "/app/documents",
    listLabel: "Documents",
    empty: () => M.emptyDocumentDraft("LAB_RESULT"),
    validate: M.validateDocument,
    fromDraft: (d) => M.documentFromDraft(d),
    Fields: DocumentFields,
  }),
  defineKind({
    kind: "imaging",
    label: "Imaging",
    blurb: "X-ray, scan, ultrasound",
    icon: ScanIcon,
    collectionKey: "documents",
    listPath: "/app/documents",
    listLabel: "Documents",
    empty: () => M.emptyDocumentDraft("SCAN"),
    validate: M.validateDocument,
    fromDraft: (d) => M.documentFromDraft(d),
    Fields: DocumentFields,
  }),
  defineKind({
    kind: "vaccination",
    label: "Vaccination",
    blurb: "A jab or immunisation",
    icon: VaccineIcon,
    collectionKey: "immunizations",
    listPath: "/app/timeline",
    listLabel: "Timeline",
    empty: M.emptyImmunizationDraft,
    validate: M.validateImmunization,
    fromDraft: (d) => M.immunizationFromDraft(d),
    Fields: ImmunizationFields,
  }),
];

export function findKind(kind: string | null | undefined): KindConfig | undefined {
  return RECORD_KINDS.find((k) => k.kind === kind);
}
