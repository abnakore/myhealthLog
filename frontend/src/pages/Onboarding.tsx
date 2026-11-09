/**
 * Onboarding — 7-step wizard.
 *
 * Changes from the mock:
 *  - finish() now calls the real API: updateProfile + addItem for each record type,
 *    then completeOnboarding(). The backend marks onboarded=true; AuthContext
 *    reflects that. All collection writes go through RecordsContext which hits
 *    the API.
 *  - Emergency contacts are written via updateProfile (which sends them to the
 *    profile endpoint). The backend creates a VitalReading for weightKg.
 *  - The wizard state still persists locally between steps so a browser
 *    refresh doesn't lose half-finished answers.
 *  - Errors from any API call surface inline rather than being swallowed.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useRecords } from "@/store/RecordsContext";
import { apiErrorMessage, apiFieldErrors } from "@/services/api";
import { SEX_LABELS, type Allergy, type Condition, type Medication } from "@/types/health";
import { calcAge, formatDate } from "@/lib/format";
import {
  emptyProfileBasicsDraft,
  validateProfileBasics,
  profileBasicsToPatch,
  emptyAllergyDraft,
  validateAllergy,
  allergyFromDraft,
  emptyMedicationDraft,
  validateMedication,
  medicationFromDraft,
  emptyConditionDraft,
  validateCondition,
  conditionFromDraft,
  emptyContactDraft,
  validateContact,
  emptyLocationDraft,
  locationToPatch,
  type LocationDraft,
  type ProfileBasicsDraft,
  type AllergyDraft,
  type MedicationDraft,
  type ConditionDraft,
  type ContactDraft,
  type FieldErrors,
} from "@/components/records/model";
import {
  ProfileBasicsFields,
  AllergyFields,
  MedicationFields,
  ConditionFields,
  ContactFields,
  LocationFields,
} from "@/components/records/FieldSets";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PlusIcon, TrashIcon } from "@/components/icons";

const KEY = "mhl.onboarding.v1";

const STEPS = [
  { tag: "Basics", q: "Let's start with the basics", lead: "None of this is required — add what you know and skip the rest." },
  { tag: "Location", q: "Where can we reach you?", lead: "So a clinic or emergency team knows how and where to find you." },
  { tag: "Allergies", q: "Any allergies we should flag?", lead: "Severe ones show on your emergency card, so they're worth adding first." },
  { tag: "Medications", q: "What are you taking right now?", lead: "Add anything you take regularly — past medications can wait." },
  { tag: "Conditions", q: "Any ongoing conditions?", lead: "Things a clinician is treating or keeping an eye on." },
  { tag: "Emergency contact", q: "Who should we call in an emergency?", lead: "One trusted person is enough to start." },
  { tag: "Review", q: "Does this look right?", lead: "You can change any of it later from your record." },
] as const;

interface OnboardingState {
  step: number;
  basics: ProfileBasicsDraft;
  location: LocationDraft;
  noAllergies: boolean;
  allergies: Allergy[];
  medications: Medication[];
  conditions: Condition[];
  contact: ContactDraft;
}

function defaultState(): OnboardingState {
  return {
    step: 0,
    basics: emptyProfileBasicsDraft(),
    location: emptyLocationDraft(),
    noAllergies: false,
    allergies: [],
    medications: [],
    conditions: [],
    contact: emptyContactDraft(),
  };
}

function initState(name: string | undefined): OnboardingState {
  let s = defaultState();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<OnboardingState>;
      s = {
        ...defaultState(),
        ...saved,
        basics: { ...emptyProfileBasicsDraft(), ...(saved.basics ?? {}) },
        location: { ...emptyLocationDraft(), ...(saved.location ?? {}) },
        contact: { ...emptyContactDraft(), ...(saved.contact ?? {}) },
      };
    }
  } catch { /* start fresh */ }
  if (!s.basics.fullName.trim() && name) {
    s = { ...s, basics: { ...s.basics, fullName: name } };
  }
  return s;
}

function AddedRow({ title, meta, onRemove }: { title: string; meta?: string; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-mhl-body font-semibold text-mhl-ink">{title}</p>
        {meta && <p className="truncate text-mhl-fine text-mhl-muted">{meta}</p>}
      </div>
      <IconButton label={`Remove ${title}`} tone="danger" onClick={onRemove}>
        <TrashIcon size={18} />
      </IconButton>
    </li>
  );
}

function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-mhl-sm border border-dashed border-mhl-rule px-4 py-3 text-mhl-body font-semibold text-mhl-muted transition-colors duration-150 ease-mhl hover:border-mhl-accent hover:bg-mhl-accent-lo hover:text-mhl-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mhl-accent"
    >
      <PlusIcon size={18} strokeWidth={2.25} />
      {label}
    </button>
  );
}

export default function Onboarding() {
  const { user, updateUser, completeOnboarding } = useAuth();
  const { addItem, updateProfile, addEmergencyContact, refresh } = useRecords();
  const navigate = useNavigate();

  const [state, setState] = useState<OnboardingState>(() => initState(user?.name));
  const [basicsErr, setBasicsErr] = useState<FieldErrors>({});
  const [contactErr, setContactErr] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Writes that already reached the server, so retrying after a failure doesn't
  // post the same contact or record twice.
  const saved = useRef({ contact: false, items: new Set<string>() });

  const [allergyDraft, setAllergyDraft] = useState<AllergyDraft | null>(null);
  const [allergyErr, setAllergyErr] = useState<FieldErrors>({});
  const [medDraft, setMedDraft] = useState<MedicationDraft | null>(null);
  const [medErr, setMedErr] = useState<FieldErrors>({});
  const [conDraft, setConDraft] = useState<ConditionDraft | null>(null);
  const [conErr, setConErr] = useState<FieldErrors>({});

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  const step = state.step;
  const meta = STEPS[step];
  const contactComplete = !!state.contact.name.trim() && !!state.contact.phone.trim();

  const goTo = (n: number) => setState((s) => ({ ...s, step: Math.max(0, Math.min(6, n)) }));

  /** The wizard hides the name field — it comes from the account, so only the
      ranges the API enforces on the other fields are worth blocking on here. */
  function checkBasics(): FieldErrors {
    const errs = validateProfileBasics({
      ...state.basics,
      fullName: state.basics.fullName.trim() || user?.name || "",
    });
    delete errs.fullName;
    return errs;
  }

  function next() {
    if (step === 0) {
      const errs = checkBasics();
      setBasicsErr(errs);
      if (Object.keys(errs).length > 0) return;
    }
    if (step === 5) {
      const started = !!state.contact.name.trim() || !!state.contact.phone.trim();
      if (started) {
        const errs = validateContact(state.contact);
        setContactErr(errs);
        if (Object.keys(errs).length > 0) return;
      } else {
        setContactErr({});
      }
    }
    goTo(step + 1);
  }

  function addAllergy() {
    if (!allergyDraft) return;
    const errs = validateAllergy(allergyDraft);
    setAllergyErr(errs);
    if (Object.keys(errs).length > 0) return;
    setState((s) => ({ ...s, allergies: [...s.allergies, allergyFromDraft(allergyDraft)], noAllergies: false }));
    setAllergyDraft(null);
  }

  function addMedication() {
    if (!medDraft) return;
    const errs = validateMedication(medDraft);
    setMedErr(errs);
    if (Object.keys(errs).length > 0) return;
    setState((s) => ({ ...s, medications: [...s.medications, medicationFromDraft(medDraft)] }));
    setMedDraft(null);
  }

  function addCondition() {
    if (!conDraft) return;
    const errs = validateCondition(conDraft);
    setConErr(errs);
    if (Object.keys(errs).length > 0) return;
    setState((s) => ({ ...s, conditions: [...s.conditions, conditionFromDraft(conDraft)] }));
    setConDraft(null);
  }

  async function finish() {
    const errs = checkBasics();
    if (Object.keys(errs).length > 0) {
      setBasicsErr(errs);
      setSaveError("Some details need fixing before we can save.");
      goTo(0);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const finalName = state.basics.fullName.trim() || user?.name || "";
      // 1. Update the profile (demographics + location + weight)
      const profilePatch: Record<string, unknown> = {
        ...profileBasicsToPatch(state.basics),
        ...locationToPatch(state.location),
        fullName: finalName,
      };
      if (state.basics.weightKg.trim()) {
        profilePatch.weightKg = parseFloat(state.basics.weightKg);
      }
      await updateProfile(profilePatch as never);

      // 2. Add emergency contact if provided
      if (contactComplete && !saved.current.contact) {
        await addEmergencyContact({
          name: state.contact.name.trim(),
          relationship: state.contact.relationship.trim(),
          phone: state.contact.phone.trim(),
          altPhone: state.contact.altPhone.trim() || undefined,
          priority: 1,
          language: state.contact.language.trim() || undefined,
          notes: state.contact.notes.trim() || undefined,
        });
        saved.current.contact = true;
      }

      // 3. Add clinical records in reverse order (newest-first in the backend list)
      const createOnce = async <K extends "allergies" | "medications" | "conditions">(
        key: K,
        item: OnboardingState[K][number],
      ) => {
        const done = `${key}:${item.id}`;
        if (saved.current.items.has(done)) return;
        await addItem(key, item);
        saved.current.items.add(done);
      };
      for (const a of [...state.allergies].reverse()) await createOnce("allergies", a);
      for (const m of [...state.medications].reverse()) await createOnce("medications", m);
      for (const c of [...state.conditions].reverse()) await createOnce("conditions", c);

      // 4. Mark onboarding complete — updates AuthContext user.onboarded
      await completeOnboarding();

      // 5. Update display name in auth context
      if (finalName) updateUser({ name: finalName });

      // 6. Reload all records so the dashboard has fresh data
      await refresh();

      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      navigate("/app", { replace: true });
    } catch (err: unknown) {
      // Point at the field the API rejected instead of a bare "Request failed".
      const details = apiFieldErrors(err);
      const fieldErrs: FieldErrors = {};
      if (details.full_name) fieldErrs.fullName = details.full_name;
      if (details.date_of_birth) fieldErrs.dateOfBirth = details.date_of_birth;
      if (details.height_cm) fieldErrs.heightCm = details.height_cm;
      if (details.weightKg) fieldErrs.weightKg = details.weightKg;
      if (Object.keys(fieldErrs).length > 0) {
        setBasicsErr(fieldErrs);
        setSaveError("Some details need fixing — check the highlighted fields.");
        goTo(0);
      } else {
        setSaveError(apiErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  function renderStep(): ReactNode {
    switch (step) {
      case 0:
        return (
          <ProfileBasicsFields
            draft={state.basics}
            hideName
            hidePhone
            hideCity
            errors={basicsErr}
            onChange={(p) => setState((s) => ({ ...s, basics: { ...s.basics, ...p } }))}
          />
        );
      case 1:
        return (
          <LocationFields
            draft={state.location}
            errors={{}}
            onChange={(p) => setState((s) => ({ ...s, location: { ...s.location, ...p } }))}
          />
        );
      case 2:
        return (
          <div className="space-y-4">
            {state.allergies.length > 0 && (
              <ul className="divide-y divide-mhl-rule">
                {state.allergies.map((a) => (
                  <AddedRow
                    key={a.id}
                    title={a.substance}
                    meta={a.reactions && a.reactions.length > 0 ? a.reactions.join(", ") : undefined}
                    onRemove={() => setState((s) => ({ ...s, allergies: s.allergies.filter((x) => x.id !== a.id) }))}
                  />
                ))}
              </ul>
            )}
            {!state.noAllergies && (
              <AddTile label="Add an allergy" onClick={() => { setAllergyDraft(emptyAllergyDraft()); setAllergyErr({}); }} />
            )}
            <label className="flex cursor-pointer items-center gap-3 text-mhl-body text-mhl-ink">
              <input
                type="checkbox"
                checked={state.noAllergies}
                onChange={(e) => setState((s) => ({ ...s, noAllergies: e.target.checked, allergies: e.target.checked ? [] : s.allergies }))}
                className="h-5 w-5 flex-none rounded accent-mhl-accent"
              />
              I have no known allergies
            </label>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            {state.medications.length > 0 && (
              <ul className="divide-y divide-mhl-rule">
                {state.medications.map((m) => (
                  <AddedRow
                    key={m.id}
                    title={m.name}
                    meta={[m.dosage, m.frequency].filter(Boolean).join("  ·  ") || undefined}
                    onRemove={() => setState((s) => ({ ...s, medications: s.medications.filter((x) => x.id !== m.id) }))}
                  />
                ))}
              </ul>
            )}
            <AddTile label="Add a medication" onClick={() => { setMedDraft(emptyMedicationDraft()); setMedErr({}); }} />
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            {state.conditions.length > 0 && (
              <ul className="divide-y divide-mhl-rule">
                {state.conditions.map((c) => (
                  <AddedRow
                    key={c.id}
                    title={c.name}
                    onRemove={() => setState((s) => ({ ...s, conditions: s.conditions.filter((x) => x.id !== c.id) }))}
                  />
                ))}
              </ul>
            )}
            <AddTile label="Add a condition" onClick={() => { setConDraft(emptyConditionDraft()); setConErr({}); }} />
          </div>
        );
      case 5:
        return (
          <ContactFields
            draft={state.contact}
            errors={contactErr}
            onChange={(p) => setState((s) => ({ ...s, contact: { ...s.contact, ...p } }))}
          />
        );
      default: {
        const b = state.basics;
        const basicsRows: [string, string][] = [];
        if (b.dateOfBirth) { const age = calcAge(b.dateOfBirth); basicsRows.push(["Date of birth", `${formatDate(b.dateOfBirth)}${age != null ? ` · ${age} yrs` : ""}`]); }
        if (b.sex) basicsRows.push(["Sex", SEX_LABELS[b.sex]]);
        if (b.bloodType) basicsRows.push(["Blood type", b.bloodType]);
        if (b.genotype) basicsRows.push(["Genotype", b.genotype]);
        if (b.heightCm.trim()) basicsRows.push(["Height", `${b.heightCm} cm`]);
        if (b.weightKg.trim()) basicsRows.push(["Weight", `${b.weightKg} kg`]);
        const l = state.location;
        const locRows: [string, string][] = [];
        if (l.phone.trim()) locRows.push(["Phone", l.phone]);
        if (l.country.trim()) locRows.push(["Country", l.country]);
        if (l.state.trim()) locRows.push(["State / region", l.state]);
        if (l.city.trim()) locRows.push(["City", l.city]);
        if (l.address.trim()) locRows.push(["Address", l.address]);
        const none = <span className="text-mhl-muted">None added</span>;
        return (
          <dl className="divide-y divide-mhl-rule">
            <ReviewBlock label="Basics" onEdit={() => goTo(0)}>
              {basicsRows.length > 0 ? <ul className="space-y-0.5">{basicsRows.map(([k, v]) => <li key={k}><span className="text-mhl-muted">{k}: </span>{v}</li>)}</ul> : <span className="text-mhl-muted">Nothing added yet</span>}
            </ReviewBlock>
            <ReviewBlock label="Location" onEdit={() => goTo(1)}>
              {locRows.length > 0 ? <ul className="space-y-0.5">{locRows.map(([k, v]) => <li key={k}><span className="text-mhl-muted">{k}: </span>{v}</li>)}</ul> : <span className="text-mhl-muted">Nothing added yet</span>}
            </ReviewBlock>
            <ReviewBlock label="Allergies" onEdit={() => goTo(2)}>
              {state.noAllergies ? "No known allergies" : state.allergies.length > 0 ? state.allergies.map((a) => a.substance).join(", ") : none}
            </ReviewBlock>
            <ReviewBlock label="Medications" onEdit={() => goTo(3)}>
              {state.medications.length > 0 ? state.medications.map((m) => m.name).join(", ") : none}
            </ReviewBlock>
            <ReviewBlock label="Conditions" onEdit={() => goTo(4)}>
              {state.conditions.length > 0 ? state.conditions.map((c) => c.name).join(", ") : none}
            </ReviewBlock>
            <ReviewBlock label="Emergency contact" onEdit={() => goTo(5)}>
              {contactComplete ? (
                <ul className="space-y-0.5">
                  <li>{`${state.contact.name}  ·  ${state.contact.phone}`}</li>
                  {state.contact.language.trim() && <li><span className="text-mhl-muted">Language / preferences: </span>{state.contact.language}</li>}
                  {state.contact.notes.trim() && <li><span className="text-mhl-muted">Notes: </span>{state.contact.notes}</li>}
                </ul>
              ) : <span className="text-mhl-muted">Not added</span>}
            </ReviewBlock>
          </dl>
        );
      }
    }
  }

  const primaryLabel = step === 6 ? (saving ? "Saving…" : "Go to Dashboard") : step === 5 ? "Review" : "Continue";

  return (
    <div className="flex min-h-dvh flex-col bg-mhl-bg px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-7 flex items-center gap-2">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-[0.65rem] bg-mhl-accent text-white">
            <PlusIcon size={20} strokeWidth={2.5} />
          </span>
          <span className="text-mhl-title font-bold tracking-[-0.02em] text-mhl-ink">myHealthLog</span>
        </div>

        <div className="mb-2 flex items-baseline justify-between gap-4">
          <span className="text-mhl-fine font-semibold text-mhl-muted">Step {step + 1} of 7</span>
          <span className="text-mhl-fine text-mhl-faint">{meta.tag}</span>
        </div>
        <ProgressBar value={((step + 1) / 7) * 100} label={`Onboarding step ${step + 1} of 7`} />

        <Card className="mt-6">
          <h1 className="text-mhl-answer font-bold text-mhl-ink">{meta.q}</h1>
          <p className="mt-2 text-mhl-body text-mhl-muted">{meta.lead}</p>
          <div className="mt-6">{renderStep()}</div>
        </Card>

        {saveError && (
          <p role="alert" className="mt-3 rounded-mhl-sm bg-mhl-danger-lo px-3.5 py-3 text-mhl-fine font-medium text-mhl-danger">
            {saveError}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          {step > 0 && <Button variant="ghost" onClick={() => goTo(step - 1)}>Back</Button>}
          <div className="flex-1" />
          {step >= 1 && step <= 5 && <Button variant="ghost" onClick={() => goTo(step + 1)}>Skip for now</Button>}
          <Button onClick={step === 6 ? finish : next} loading={saving} disabled={saving}>{primaryLabel}</Button>
        </div>
      </div>

      <RecordEditModal<AllergyDraft>
        open={allergyDraft !== null}
        title="Add allergy" saveLabel="Add"
        draft={allergyDraft} errors={allergyErr} Fields={AllergyFields}
        onChange={(p) => setAllergyDraft((d) => (d ? { ...d, ...p } : d))}
        onSave={addAllergy} onClose={() => setAllergyDraft(null)}
      />
      <RecordEditModal<MedicationDraft>
        open={medDraft !== null}
        title="Add medication" saveLabel="Add"
        draft={medDraft} errors={medErr} Fields={MedicationFields}
        onChange={(p) => setMedDraft((d) => (d ? { ...d, ...p } : d))}
        onSave={addMedication} onClose={() => setMedDraft(null)}
      />
      <RecordEditModal<ConditionDraft>
        open={conDraft !== null}
        title="Add condition" saveLabel="Add"
        draft={conDraft} errors={conErr} Fields={ConditionFields}
        onChange={(p) => setConDraft((d) => (d ? { ...d, ...p } : d))}
        onSave={addCondition} onClose={() => setConDraft(null)}
      />
    </div>
  );
}

function ReviewBlock({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <dt className="text-mhl-fine font-medium text-mhl-muted">{label}</dt>
        <button type="button" onClick={onEdit} className="text-mhl-fine font-semibold text-mhl-accent transition-colors hover:text-mhl-accent-strong">Edit</button>
      </div>
      <dd className="mt-1 text-mhl-body text-mhl-ink">{children}</dd>
    </div>
  );
}
