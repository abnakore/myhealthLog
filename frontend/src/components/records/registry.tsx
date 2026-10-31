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
import type { DocumentType, HealthDocument } from "@/types/health";
import type { FieldErrors } from "./model";
import * as M from "./model";
import {
  AllergyFields,
  AppointmentFields,
  ConditionFields,
  DocumentFields,
  ImagingFields,
  LabResultFields,
  MedicationFields,
  VitalFields,
} from "./FieldSets";
import {
  AllergyIcon,
  CalendarIcon,
  ConditionIcon,
  DocumentIcon,
  PillIcon,
  ScanIcon,
  VitalsIcon,
} from "@/components/icons";

export type RecordKind =
  | "medication"
  | "vital"
  | "allergy"
  | "condition"
  | "visit"
  | "lab"
  | "imaging"
  | "document";

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
  /** The URL segment that lists this kind, e.g. "medications". Derived from
   *  `listPath` so the route and the list can never disagree. */
  routeKey: string;
  /** The kind that represents its route when several kinds share one list — the
   *  Documents list holds lab results, imaging and general documents, and the
   *  route shows the generic one. */
  canonical: boolean;
  empty: () => unknown;
  validate: (draft: unknown) => FieldErrors;
  /** `base` is the record being edited; passing it keeps its id and added-at
   *  stamp. It is absent when the draft is a brand-new record. */
  fromDraft: (draft: unknown, base?: unknown) => unknown;
  Fields: ComponentType<FieldSetComponentProps<unknown>>;
}

/** Typed builder: infers the draft type D from `empty`/`Fields`/`validate`, checks the
    whole entry against it, then erases on return. `routeKey` is derived from the
    list path so the record route and the list it points at can never drift. */
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
  fromDraft: (draft: D, base?: R) => R;
  Fields: ComponentType<FieldSetComponentProps<D>>;
  /** Defaults to true. Set false on a kind that shares its route with another
   *  kind — the generic Document kind represents the shared Documents route. */
  canonical?: boolean;
}): KindConfig {
  const routeKey = config.listPath.split("/").filter(Boolean).pop() ?? config.kind;
  const { canonical = true, ...rest } = config;
  return { ...rest, routeKey, canonical } as unknown as KindConfig;
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
    kind: "vital",
    label: "Measurement",
    blurb: "A vital sign or reading",
    icon: VitalsIcon,
    collectionKey: "vitals",
    listPath: "/app/measurements",
    listLabel: "Measurements",
    empty: () => M.emptyVitalDraft(),
    validate: M.validateVital,
    fromDraft: (d) => M.vitalFromDraft(d),
    Fields: VitalFields,
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
  defineKind<M.DocumentDraft, HealthDocument>({
    kind: "lab",
    label: "Lab result",
    blurb: "Blood work, test results",
    icon: DocumentIcon,
    collectionKey: "documents",
    listPath: "/app/documents",
    listLabel: "Documents",
    empty: () => M.emptyDocumentDraft("LAB_RESULT"),
    validate: M.validateDocument,
    fromDraft: (d, base) => M.documentFromDraft(d, base),
    Fields: LabResultFields,
    // Shares the Documents route with the generic Document kind.
    canonical: false,
  }),
  defineKind<M.DocumentDraft, HealthDocument>({
    kind: "imaging",
    label: "Imaging",
    blurb: "X-ray, scan, ultrasound",
    icon: ScanIcon,
    collectionKey: "documents",
    listPath: "/app/documents",
    listLabel: "Documents",
    empty: () => M.emptyDocumentDraft("SCAN"),
    validate: M.validateDocument,
    fromDraft: (d, base) => M.documentFromDraft(d, base),
    Fields: ImagingFields,
    // Shares the Documents route with the generic Document kind.
    canonical: false,
  }),
  defineKind<M.DocumentDraft, HealthDocument>({
    kind: "document",
    label: "Document",
    blurb: "Any other health document",
    icon: DocumentIcon,
    collectionKey: "documents",
    listPath: "/app/documents",
    listLabel: "Documents",
    // The general "anything else" upload — letters, referrals, insurance papers.
    empty: () => M.emptyDocumentDraft("OTHER"),
    validate: M.validateDocument,
    fromDraft: (d, base) => M.documentFromDraft(d, base),
    Fields: DocumentFields,
  }),
];

export function findKind(kind: string | null | undefined): KindConfig | undefined {
  return RECORD_KINDS.find((k) => k.kind === kind);
}

/** The record kind that owns a document of this type. Lab results and scans are
 *  their own kinds — so their view and edit screens show their own fields —
 *  while every other document shares the general Document kind. */
const DOCUMENT_KIND_BY_TYPE: Record<DocumentType, RecordKind> = {
  LAB_RESULT: "lab",
  SCAN: "imaging",
  PRESCRIPTION: "document",
  DISCHARGE_SUMMARY: "document",
  OTHER: "document",
};

export function documentKindFor(docType: DocumentType | undefined): RecordKind {
  return docType ? DOCUMENT_KIND_BY_TYPE[docType] ?? "document" : "document";
}

/**
 * Resolves a URL segment to the kind that represents it.
 *
 * The route segment is the *list* name ("medications", "documents"), which several
 * kinds may share — lab results, imaging and general documents all live under
 * "documents". The canonical kind of each route wins, so the page always presents
 * the kind that owns the list.
 */
export function findKindByRoute(route: string | null | undefined): KindConfig | undefined {
  if (!route) return undefined;
  const matches = RECORD_KINDS.filter((k) => k.routeKey === route);
  return matches.find((k) => k.canonical) ?? matches[0];
}
