import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useRecords } from "@/store/RecordsContext";
import { SEX_LABELS, type Allergy, type Condition, type Medication } from "@/types/health";
import { calcAge, formatDate } from "@/lib/format";
import {
  emptyProfileBasicsDraft,
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
  contactFromDraft,
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
  {
    tag: "Basics",
    q: "Let's start with the basics",
    lead: "None of this is required — add what you know and skip the rest.",
  },
  {
    tag: "Location",
    q: "Where can we reach you?",
    lead: "So a clinic or emergency team knows how and where to find you.",
  },
  {
    tag: "Allergies",
    q: "Any allergies we should flag?",
    lead: "Severe ones show on your emergency card, so they're worth adding first.",
  },
  {
    tag: "Medications",
    q: "What are you taking right now?",
    lead: "Add anything you take regularly — past medications can wait.",
  },
  {
    tag: "Conditions",
    q: "Any ongoing conditions?",
    lead: "Things a clinician is treating or keeping an eye on.",
  },
  {
    tag: "Emergency contact",
    q: "Who should we call in an emergency?",
    lead: "One trusted person is enough to start.",
  },
  {
    tag: "Review",
    q: "Does this look right?",
    lead: "You can change any of it later from your record.",
  },
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

/** Resume from a half-finished session if one was saved, and seed the name from the
    account so the (hidden) name field is already populated. */
function initState(name: string | undefined): OnboardingState {
  let s = defaultState();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<OnboardingState>;
      // Rehydrate each draft *over* the current empty draft, not in place of it —
      // a session saved by an older build (missing a newly-added key) otherwise
      // leaves `undefined` fields behind.
      s = {
        ...defaultState(),
        ...saved,
        basics: { ...emptyProfileBasicsDraft(), ...(saved.basics ?? {}) },
        location: { ...emptyLocationDraft(), ...(saved.location ?? {}) },
        contact: { ...emptyContactDraft(), ...(saved.contact ?? {}) },
      };
    }
  } catch {
    /* corrupt / unavailable storage — start fresh */
  }
  if (!s.basics.fullName.trim() && name) {
    s = { ...s, basics: { ...s.basics, fullName: name } };
  }
  // Sessions saved before the "Location" step kept phone + city under basics.
  if (
    (!s.location.phone.trim() && s.basics.phone.trim()) ||
    (!s.location.city.trim() && s.basics.city.trim())
  ) {
    const prevPhone = s.basics.phone;
    const prevCity = s.basics.city;
    s = {
      ...s,
      basics: { ...s.basics, phone: "", city: "" },
      location: { ...s.location, phone: s.location.phone || prevPhone, city: s.location.city || prevCity },
    };
  }
  return s;
}

/** One saved item inside a step, with a remove control. */
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

/** The dashed "add another" affordance shared by the allergy / medication / condition steps. */
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
  const { profile, addItem, updateProfile } = useRecords();
  const navigate = useNavigate();

  const [state, setState] = useState<OnboardingState>(() => initState(user?.name));
  const [contactErr, setContactErr] = useState<FieldErrors>({});

  // Transient add-item modals — their drafts don't need persisting.
  const [allergyDraft, setAllergyDraft] = useState<AllergyDraft | null>(null);
  const [allergyErr, setAllergyErr] = useState<FieldErrors>({});
  const [medDraft, setMedDraft] = useState<MedicationDraft | null>(null);
  const [medErr, setMedErr] = useState<FieldErrors>({});
  const [conDraft, setConDraft] = useState<ConditionDraft | null>(null);
  const [conErr, setConErr] = useState<FieldErrors>({});

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* non-fatal — progress just won't survive a reload */
    }
  }, [state]);

  const step = state.step;
  const meta = STEPS[step];
  const contactComplete = !!state.contact.name.trim() && !!state.contact.phone.trim();

  const goTo = (n: number) => setState((s) => ({ ...s, step: Math.max(0, Math.min(6, n)) }));

  function next() {
    // Leaving the contact step: if they started filling it in, it has to be valid.
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
    const rec = allergyFromDraft(allergyDraft);
    setState((s) => ({ ...s, allergies: [...s.allergies, rec], noAllergies: false }));
    setAllergyDraft(null);
  }

  function addMedication() {
    if (!medDraft) return;
    const errs = validateMedication(medDraft);
    setMedErr(errs);
    if (Object.keys(errs).length > 0) return;
    const rec = medicationFromDraft(medDraft);
    setState((s) => ({ ...s, medications: [...s.medications, rec] }));
    setMedDraft(null);
  }

  function addCondition() {
    if (!conDraft) return;
    const errs = validateCondition(conDraft);
    setConErr(errs);
    if (Object.keys(errs).length > 0) return;
    const rec = conditionFromDraft(conDraft);
    setState((s) => ({ ...s, conditions: [...s.conditions, rec] }));
    setConDraft(null);
  }

  function finish() {
    const finalName = state.basics.fullName.trim() || user?.name || profile.fullName;
    updateProfile({
      ...profileBasicsToPatch(state.basics),
      ...locationToPatch(state.location),
      fullName: finalName,
      ...(contactComplete ? { emergencyContacts: [contactFromDraft(state.contact, 1)] } : {}),
    });
    // Newest-first store → add in reverse so the list reads in the order they were entered.
    [...state.allergies].reverse().forEach((a) => addItem("allergies", a));
    [...state.medications].reverse().forEach((m) => addItem("medications", m));
    [...state.conditions].reverse().forEach((c) => addItem("conditions", c));
    updateUser({ name: finalName });
    completeOnboarding();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    navigate("/app", { replace: true });
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
            errors={{}}
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
                    onRemove={() =>
                      setState((s) => ({ ...s, allergies: s.allergies.filter((x) => x.id !== a.id) }))
                    }
                  />
                ))}
              </ul>
            )}
            {!state.noAllergies && (
              <AddTile
                label="Add an allergy"
                onClick={() => {
                  setAllergyDraft(emptyAllergyDraft());
                  setAllergyErr({});
                }}
              />
            )}
            <label className="flex cursor-pointer items-center gap-3 text-mhl-body text-mhl-ink">
              <input
                type="checkbox"
                checked={state.noAllergies}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    noAllergies: e.target.checked,
                    allergies: e.target.checked ? [] : s.allergies,
                  }))
                }
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
                    onRemove={() =>
                      setState((s) => ({ ...s, medications: s.medications.filter((x) => x.id !== m.id) }))
                    }
                  />
                ))}
              </ul>
            )}
            <AddTile
              label="Add a medication"
              onClick={() => {
                setMedDraft(emptyMedicationDraft());
                setMedErr({});
              }}
            />
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
                    onRemove={() =>
                      setState((s) => ({ ...s, conditions: s.conditions.filter((x) => x.id !== c.id) }))
                    }
                  />
                ))}
              </ul>
            )}
            <AddTile
              label="Add a condition"
              onClick={() => {
                setConDraft(emptyConditionDraft());
                setConErr({});
              }}
            />
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
        const basicsRows: [string, string][] = [];
        const b = state.basics;
        if (b.dateOfBirth) {
          const age = calcAge(b.dateOfBirth);
          basicsRows.push([
            "Date of birth",
            `${formatDate(b.dateOfBirth)}${age != null ? ` · ${age} yrs` : ""}`,
          ]);
        }
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
              {basicsRows.length > 0 ? (
                <ul className="space-y-0.5">
                  {basicsRows.map(([k, v]) => (
                    <li key={k}>
                      <span className="text-mhl-muted">{k}: </span>
                      {v}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-mhl-muted">Nothing added yet</span>
              )}
            </ReviewBlock>
            <ReviewBlock label="Location" onEdit={() => goTo(1)}>
              {locRows.length > 0 ? (
                <ul className="space-y-0.5">
                  {locRows.map(([k, v]) => (
                    <li key={k}>
                      <span className="text-mhl-muted">{k}: </span>
                      {v}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-mhl-muted">Nothing added yet</span>
              )}
            </ReviewBlock>
            <ReviewBlock label="Allergies" onEdit={() => goTo(2)}>
              {state.noAllergies
                ? "No known allergies"
                : state.allergies.length > 0
                  ? state.allergies.map((a) => a.substance).join(", ")
                  : none}
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
                  {state.contact.language.trim() && (
                    <li>
                      <span className="text-mhl-muted">Language / preferences: </span>
                      {state.contact.language}
                    </li>
                  )}
                  {state.contact.notes.trim() && (
                    <li>
                      <span className="text-mhl-muted">Notes: </span>
                      {state.contact.notes}
                    </li>
                  )}
                </ul>
              ) : (
                <span className="text-mhl-muted">Not added</span>
              )}
            </ReviewBlock>
          </dl>
        );
      }
    }
  }

  const primaryLabel = step === 6 ? "Go to Dashboard" : step === 5 ? "Review" : "Continue";

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

        <div className="mt-5 flex items-center gap-3">
          {step > 0 && (
            <Button variant="ghost" onClick={() => goTo(step - 1)}>
              Back
            </Button>
          )}
          <div className="flex-1" />
          {step >= 1 && step <= 5 && (
            <Button variant="ghost" onClick={() => goTo(step + 1)}>
              Skip for now
            </Button>
          )}
          <Button onClick={step === 6 ? finish : next}>{primaryLabel}</Button>
        </div>
      </div>

      <RecordEditModal<AllergyDraft>
        open={allergyDraft !== null}
        title="Add allergy"
        saveLabel="Add"
        draft={allergyDraft}
        errors={allergyErr}
        Fields={AllergyFields}
        onChange={(p) => setAllergyDraft((d) => (d ? { ...d, ...p } : d))}
        onSave={addAllergy}
        onClose={() => setAllergyDraft(null)}
      />
      <RecordEditModal<MedicationDraft>
        open={medDraft !== null}
        title="Add medication"
        saveLabel="Add"
        draft={medDraft}
        errors={medErr}
        Fields={MedicationFields}
        onChange={(p) => setMedDraft((d) => (d ? { ...d, ...p } : d))}
        onSave={addMedication}
        onClose={() => setMedDraft(null)}
      />
      <RecordEditModal<ConditionDraft>
        open={conDraft !== null}
        title="Add condition"
        saveLabel="Add"
        draft={conDraft}
        errors={conErr}
        Fields={ConditionFields}
        onChange={(p) => setConDraft((d) => (d ? { ...d, ...p } : d))}
        onSave={addCondition}
        onClose={() => setConDraft(null)}
      />
    </div>
  );
}

/** A labelled block on the review step, with an inline jump back to that step. */
function ReviewBlock({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <dt className="text-mhl-fine font-medium text-mhl-muted">{label}</dt>
        <button
          type="button"
          onClick={onEdit}
          className="text-mhl-fine font-semibold text-mhl-accent transition-colors hover:text-mhl-accent-strong"
        >
          Edit
        </button>
      </div>
      <dd className="mt-1 text-mhl-body text-mhl-ink">{children}</dd>
    </div>
  );
}
