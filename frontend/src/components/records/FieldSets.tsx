/**
 * Controlled field groups, one per record type. Each takes a draft, an onChange that
 * receives a partial patch, and a map of field errors. They render only inputs — no
 * submit button, no card — so the same group works inside the Add page, an edit modal,
 * and an onboarding step.
 */
import type { ReactNode } from "react";
import { TextField, TextArea, SelectField } from "@/components/ui/fields";
import { TagInput } from "@/components/ui/TagInput";
import { FileDrop } from "@/components/ui/FileDrop";
import {
  ALLERGY_TYPE_LABELS,
  ALLERGY_SEVERITY_LABELS,
  APPOINTMENT_STATUS_LABELS,
  BLOOD_TYPES,
  CONDITION_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  GENOTYPES,
  SEVERITY_LABELS,
  SEX_LABELS,
  VITAL_LABELS,
  VITAL_META,
  type AllergySeverity,
  type AllergyType,
  type AppointmentStatus,
  type BloodType,
  type ClinicalSeverity,
  type ConditionStatus,
  type DocumentType,
  type Genotype,
  type Sex,
  type VitalType,
} from "@/types/health";
import type {
  AllergyDraft,
  AppointmentDraft,
  ConditionDraft,
  ContactDraft,
  DocumentDraft,
  ImmunizationDraft,
  LocationDraft,
  MedicationDraft,
  ProfileBasicsDraft,
  VitalReadingDraft,
} from "./model";

interface FieldSetProps<D> {
  draft: D;
  onChange: (patch: Partial<D>) => void;
  errors: Record<string, string>;
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

/** A labelled checkbox row — used for the few boolean fields (verified, active). */
function CheckRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-mhl-sm border border-mhl-rule bg-mhl-sunk px-3.5 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 flex-none rounded accent-mhl-accent"
      />
      <span className="min-w-0">
        <span className="block text-mhl-body font-medium text-mhl-ink">{label}</span>
        {hint && <span className="block text-mhl-fine text-mhl-muted">{hint}</span>}
      </span>
    </label>
  );
}

const optionsFrom = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));

/* --------------------------------------------------------------- allergy -- */

export function AllergyFields({ draft, onChange, errors }: FieldSetProps<AllergyDraft>) {
  return (
    <div className="space-y-4">
      <TextField
        label="What are you allergic to?"
        value={draft.substance}
        error={errors.substance}
        placeholder="e.g. Penicillin, peanuts, dust"
        onChange={(e) => onChange({ substance: e.target.value })}
      />
      <Row>
        <SelectField
          label="Type"
          value={draft.allergyType}
          onChange={(e) => onChange({ allergyType: e.target.value as AllergyType })}
        >
          {optionsFrom(ALLERGY_TYPE_LABELS)}
        </SelectField>
        <SelectField
          label="How severe?"
          value={draft.severity}
          onChange={(e) => onChange({ severity: e.target.value as AllergySeverity })}
        >
          {optionsFrom(ALLERGY_SEVERITY_LABELS)}
        </SelectField>
      </Row>
      <TagInput
        label="Reactions"
        value={draft.reactions}
        onChange={(reactions) => onChange({ reactions })}
        placeholder="Add a reaction, press Enter"
        optional
      />
      <TagInput
        label="Known triggers"
        value={draft.triggers}
        onChange={(triggers) => onChange({ triggers })}
        placeholder="Add a trigger, press Enter"
        optional
      />
      <TextField
        label="First reaction"
        type="date"
        value={draft.firstReactionDate}
        onChange={(e) => onChange({ firstReactionDate: e.target.value })}
        optional
      />
      <TextArea
        label="Notes"
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="Anything a clinician should know — current treatment, whether you carry adrenaline…"
        optional
      />
      <CheckRow
        label="Confirmed by a clinician"
        hint="Leave off if this is something you've noticed yourself."
        checked={draft.isVerified}
        onChange={(isVerified) => onChange({ isVerified })}
      />
    </div>
  );
}

/* ------------------------------------------------------------ medication -- */

export function MedicationFields({ draft, onChange, errors }: FieldSetProps<MedicationDraft>) {
  return (
    <div className="space-y-4">
      <TextField
        label="Medication name"
        value={draft.name}
        error={errors.name}
        placeholder="e.g. Metformin"
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <Row>
        <TextField
          label="Dosage"
          value={draft.dosage}
          placeholder="500 mg"
          onChange={(e) => onChange({ dosage: e.target.value })}
          optional
        />
        <TextField
          label="Form"
          value={draft.form}
          placeholder="Tablet, syrup…"
          onChange={(e) => onChange({ form: e.target.value })}
          optional
        />
      </Row>
      <TextField
        label="How often?"
        value={draft.frequency}
        placeholder="e.g. Twice daily"
        onChange={(e) => onChange({ frequency: e.target.value })}
        optional
      />
      <Row>
        <TextField
          label="Started"
          type="date"
          value={draft.startDate}
          error={errors.startDate}
          onChange={(e) => onChange({ startDate: e.target.value })}
        />
        <TextField
          label="Ended"
          type="date"
          value={draft.endDate}
          error={errors.endDate}
          onChange={(e) => onChange({ endDate: e.target.value })}
          optional
        />
      </Row>
      <TextField
        label="Prescribed by"
        value={draft.prescriber}
        placeholder="e.g. Dr. F. Abdullahi"
        onChange={(e) => onChange({ prescriber: e.target.value })}
        optional
      />
      <TextField
        label="What's it for?"
        value={draft.reason}
        placeholder="e.g. Type 2 diabetes"
        onChange={(e) => onChange({ reason: e.target.value })}
        optional
      />
      <TextArea
        label="Notes"
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        optional
      />
      <CheckRow
        label="Currently taking this"
        hint="Turn off for a past medication."
        checked={draft.active}
        onChange={(active) => onChange({ active })}
      />
    </div>
  );
}

/* ------------------------------------------------------------- condition -- */

export function ConditionFields({ draft, onChange, errors }: FieldSetProps<ConditionDraft>) {
  return (
    <div className="space-y-4">
      <TextField
        label="Condition"
        value={draft.name}
        error={errors.name}
        placeholder="e.g. Type 2 diabetes"
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <Row>
        <SelectField
          label="Where it stands"
          value={draft.status}
          onChange={(e) => onChange({ status: e.target.value as ConditionStatus })}
        >
          {optionsFrom(CONDITION_STATUS_LABELS)}
        </SelectField>
        <SelectField
          label="How severe?"
          value={draft.severity}
          placeholder="Not sure"
          onChange={(e) => onChange({ severity: e.target.value as ClinicalSeverity | "" })}
        >
          {optionsFrom(SEVERITY_LABELS)}
        </SelectField>
      </Row>
      <TextField
        label="When diagnosed"
        type="date"
        value={draft.onsetDate}
        onChange={(e) => onChange({ onsetDate: e.target.value })}
        optional
      />
      {draft.status === "RESOLVED" && (
        <TextField
          label="When it resolved"
          type="date"
          value={draft.resolvedDate}
          onChange={(e) => onChange({ resolvedDate: e.target.value })}
          optional
        />
      )}
      <TextArea
        label="Notes"
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        optional
      />
    </div>
  );
}

/* ----------------------------------------------------------- appointment -- */

export function AppointmentFields({ draft, onChange, errors }: FieldSetProps<AppointmentDraft>) {
  return (
    <div className="space-y-4">
      <TextField
        label="What's the visit for?"
        value={draft.title}
        error={errors.title}
        placeholder="e.g. Endocrinology follow-up"
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <TextField
        label="Date and time"
        type="datetime-local"
        value={draft.scheduledFor}
        error={errors.scheduledFor}
        onChange={(e) => onChange({ scheduledFor: e.target.value })}
      />
      <Row>
        <TextField
          label="Doctor"
          value={draft.clinician}
          placeholder="e.g. Dr. Abdullahi"
          onChange={(e) => onChange({ clinician: e.target.value })}
          optional
        />
        <SelectField
          label="Status"
          value={draft.status}
          onChange={(e) => onChange({ status: e.target.value as AppointmentStatus })}
        >
          {optionsFrom(APPOINTMENT_STATUS_LABELS)}
        </SelectField>
      </Row>
      <TextField
        label="Where"
        value={draft.facility}
        placeholder="e.g. Aminu Kano Teaching Hospital"
        onChange={(e) => onChange({ facility: e.target.value })}
        optional
      />
      <TextArea
        label="Notes"
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        optional
      />
    </div>
  );
}

/* -------------------------------------------------------------- document -- */

export function DocumentFields({ draft, onChange, errors }: FieldSetProps<DocumentDraft>) {
  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        value={draft.title}
        error={errors.title}
        placeholder="e.g. Full blood count"
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <Row>
        <SelectField
          label="Kind"
          value={draft.docType}
          onChange={(e) => onChange({ docType: e.target.value as DocumentType })}
        >
          {optionsFrom(DOCUMENT_TYPE_LABELS)}
        </SelectField>
        <TextField
          label="Date on document"
          type="date"
          value={draft.documentDate}
          onChange={(e) => onChange({ documentDate: e.target.value })}
          optional
        />
      </Row>
      <FileDrop
        label="File"
        value={draft.file}
        onChange={(file) => onChange({ file } as Partial<DocumentDraft>)}
        hint={
          draft.existingFileName && !draft.file
            ? `Currently: ${draft.existingFileName}`
            : "PDF, image or scan"
        }
      />
      {errors.file && <p className="text-mhl-fine text-mhl-danger">{errors.file}</p>}
    </div>
  );
}

/* ----------------------------------------------------------- immunization -- */

export function ImmunizationFields({ draft, onChange, errors }: FieldSetProps<ImmunizationDraft>) {
  return (
    <div className="space-y-4">
      <TextField
        label="Vaccine"
        value={draft.vaccine}
        error={errors.vaccine}
        placeholder="e.g. Tetanus (Td)"
        onChange={(e) => onChange({ vaccine: e.target.value })}
      />
      <Row>
        <TextField
          label="Dose number"
          type="number"
          inputMode="numeric"
          value={draft.doseNumber}
          placeholder="1"
          onChange={(e) => onChange({ doseNumber: e.target.value })}
          optional
        />
        <TextField
          label="Given on"
          type="date"
          value={draft.administeredOn}
          error={errors.administeredOn}
          onChange={(e) => onChange({ administeredOn: e.target.value })}
        />
      </Row>
      <TextField
        label="Next dose due"
        type="date"
        value={draft.nextDue}
        onChange={(e) => onChange({ nextDue: e.target.value })}
        optional
      />
      <TextArea
        label="Notes"
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        optional
      />
    </div>
  );
}

/* ----------------------------------------------------------------- vitals -- */

export function VitalFields({ draft, onChange, errors }: FieldSetProps<VitalReadingDraft>) {
  const meta = VITAL_META[draft.vitalType];
  const isCustom = draft.vitalType === "CUSTOM";
  return (
    <div className="space-y-4">
      <SelectField
        label="What did you measure?"
        value={draft.vitalType}
        onChange={(e) => {
          // Switch type and reset the unit to the new type's default in one patch.
          const vitalType = e.target.value as VitalType;
          onChange({ vitalType, unit: VITAL_META[vitalType].unit });
        }}
      >
        {optionsFrom(VITAL_LABELS)}
      </SelectField>

      {isCustom && (
        <Row>
          <TextField
            label="Measurement name"
            value={draft.label}
            error={errors.label}
            placeholder="e.g. Ketones"
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <TextField
            label="Unit"
            value={draft.unit}
            error={errors.unit}
            placeholder="e.g. mmol/L"
            onChange={(e) => onChange({ unit: e.target.value })}
          />
        </Row>
      )}

      {meta.dual ? (
        <Row>
          <TextField
            label={`${meta.valueLabel ?? "Value"} (${meta.unit})`}
            type="number"
            inputMode="decimal"
            step={meta.step}
            value={draft.value}
            error={errors.value}
            placeholder="120"
            onChange={(e) => onChange({ value: e.target.value })}
          />
          <TextField
            label={`${meta.value2Label ?? "Second value"} (${meta.unit})`}
            type="number"
            inputMode="decimal"
            step={meta.step}
            value={draft.value2}
            error={errors.value2}
            placeholder="80"
            onChange={(e) => onChange({ value2: e.target.value })}
          />
        </Row>
      ) : (
        <TextField
          label={isCustom || !draft.unit ? "Value" : `Value (${draft.unit})`}
          type="number"
          inputMode="decimal"
          step={meta.step}
          value={draft.value}
          error={errors.value}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      )}

      <TextField
        label="When"
        type="datetime-local"
        value={draft.measuredAt}
        error={errors.measuredAt}
        onChange={(e) => onChange({ measuredAt: e.target.value })}
      />
      <TextField
        label="Context"
        value={draft.context}
        placeholder="e.g. Fasting, sitting, after exercise"
        onChange={(e) => onChange({ context: e.target.value })}
        optional
      />
    </div>
  );
}

/* --------------------------------------------------------- profile basics -- */

export function ProfileBasicsFields({
  draft,
  onChange,
  errors,
  hideName = false,
  hidePhone = false,
  hideCity = false,
}: FieldSetProps<ProfileBasicsDraft> & { hideName?: boolean; hidePhone?: boolean; hideCity?: boolean }) {
  return (
    <div className="space-y-4">
      {!hideName && (
        <TextField
          label="Full name"
          value={draft.fullName}
          error={errors.fullName}
          onChange={(e) => onChange({ fullName: e.target.value })}
        />
      )}
      <Row>
        <TextField
          label="Date of birth"
          type="date"
          value={draft.dateOfBirth}
          onChange={(e) => onChange({ dateOfBirth: e.target.value })}
          optional
        />
        <SelectField
          label="Sex"
          value={draft.sex}
          placeholder="Prefer not to say"
          onChange={(e) => onChange({ sex: e.target.value as Sex | "" })}
        >
          {optionsFrom(SEX_LABELS)}
        </SelectField>
      </Row>
      <Row>
        <SelectField
          label="Blood type"
          value={draft.bloodType}
          placeholder="Unknown"
          onChange={(e) => onChange({ bloodType: e.target.value as BloodType | "" })}
        >
          {BLOOD_TYPES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Genotype"
          value={draft.genotype}
          placeholder="Unknown"
          onChange={(e) => onChange({ genotype: e.target.value as Genotype | "" })}
        >
          {GENOTYPES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </SelectField>
      </Row>
      <Row>
        <TextField
          label="Height (cm)"
          type="number"
          inputMode="numeric"
          value={draft.heightCm}
          onChange={(e) => onChange({ heightCm: e.target.value })}
          optional
        />
        <TextField
          label="Weight (kg)"
          type="number"
          inputMode="numeric"
          value={draft.weightKg}
          onChange={(e) => onChange({ weightKg: e.target.value })}
          optional
        />
      </Row>
      {hidePhone && hideCity ? null : hidePhone ? (
        <TextField
          label="City"
          value={draft.city}
          placeholder="Kano"
          onChange={(e) => onChange({ city: e.target.value })}
          optional
        />
      ) : hideCity ? (
        <TextField
          label="Phone"
          type="tel"
          value={draft.phone}
          placeholder="0803 000 1122"
          onChange={(e) => onChange({ phone: e.target.value })}
          optional
        />
      ) : (
        <Row>
          <TextField
            label="Phone"
            type="tel"
            value={draft.phone}
            placeholder="0803 000 1122"
            onChange={(e) => onChange({ phone: e.target.value })}
            optional
          />
          <TextField
            label="City"
            value={draft.city}
            placeholder="Kano"
            onChange={(e) => onChange({ city: e.target.value })}
            optional
          />
        </Row>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- location -- */

export function LocationFields({ draft, onChange }: FieldSetProps<LocationDraft>) {
  return (
    <div className="space-y-4">
      <Row>
        <TextField
          label="Phone"
          type="tel"
          value={draft.phone}
          placeholder="0803 000 1122"
          onChange={(e) => onChange({ phone: e.target.value })}
          optional
        />
        <TextField
          label="City"
          value={draft.city}
          placeholder="Kano"
          onChange={(e) => onChange({ city: e.target.value })}
          optional
        />
      </Row>
      <Row>
        <TextField
          label="Country"
          value={draft.country}
          placeholder="Nigeria"
          onChange={(e) => onChange({ country: e.target.value })}
          optional
        />
        <TextField
          label="State / region"
          value={draft.state}
          placeholder="Kano"
          onChange={(e) => onChange({ state: e.target.value })}
          optional
        />
      </Row>
      <TextArea
        label="Address"
        value={draft.address}
        placeholder="House no., street, area"
        onChange={(e) => onChange({ address: e.target.value })}
        optional
      />
    </div>
  );
}

/* ------------------------------------------------------- emergency contact -- */

export function ContactFields({ draft, onChange, errors }: FieldSetProps<ContactDraft>) {
  return (
    <div className="space-y-4">
      <TextField
        label="Name"
        value={draft.name}
        error={errors.name}
        placeholder="e.g. Ibrahim Yusuf"
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <Row>
        <TextField
          label="Relationship"
          value={draft.relationship}
          placeholder="e.g. Husband"
          onChange={(e) => onChange({ relationship: e.target.value })}
          optional
        />
        <TextField
          label="Phone"
          type="tel"
          value={draft.phone}
          error={errors.phone}
          placeholder="0803 555 7788"
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </Row>
      <TextField
        label="Another number"
        type="tel"
        value={draft.altPhone}
        onChange={(e) => onChange({ altPhone: e.target.value })}
        optional
      />
      <TextField
        label="Emergency language / preferences"
        value={draft.language}
        placeholder="e.g. Hausa, English"
        onChange={(e) => onChange({ language: e.target.value })}
        optional
      />
      <TextArea
        label="Emergency notes"
        value={draft.notes}
        placeholder="Anything a first responder should know about you"
        onChange={(e) => onChange({ notes: e.target.value })}
        optional
      />
    </div>
  );
}
