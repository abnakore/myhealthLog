import { useState, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useRecords } from "@/store/RecordsContext";
import { calcAge, formatDate } from "@/lib/format";
import { SEX_LABELS, type EmergencyContact } from "@/types/health";
import {
  profileToBasicsDraft,
  validateProfileBasics,
  profileBasicsToPatch,
  emptyContactDraft,
  contactToDraft,
  validateContact,
  contactFromDraft,
  type ProfileBasicsDraft,
  type ContactDraft,
  type FieldErrors,
} from "@/components/records/model";
import { ProfileBasicsFields, ContactFields } from "@/components/records/FieldSets";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { EditIcon, PhoneIcon, PlusIcon, TrashIcon, UserIcon } from "@/components/icons";

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-mhl-fine text-mhl-muted">{label}</dt>
      <dd className="mt-0.5 text-mhl-body font-medium text-mhl-ink">{value || "—"}</dd>
    </div>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const { profile, updateProfile } = useRecords();

  const [basicsDraft, setBasicsDraft] = useState<ProfileBasicsDraft | null>(null);
  const [basicsErrors, setBasicsErrors] = useState<FieldErrors>({});

  const [contactState, setContactState] = useState<{ id: string | null; draft: ContactDraft } | null>(null);
  const [contactErrors, setContactErrors] = useState<FieldErrors>({});
  const [contactToDelete, setContactToDelete] = useState<EmergencyContact | null>(null);

  const age = calcAge(profile.dateOfBirth);
  const contacts = [...profile.emergencyContacts].sort((a, b) => a.priority - b.priority);
  const metaLine = [age != null ? `${age} yrs` : null, profile.sex ? SEX_LABELS[profile.sex] : null, profile.city]
    .filter(Boolean)
    .join("  ·  ");

  function saveBasics() {
    if (!basicsDraft) return;
    const errs = validateProfileBasics(basicsDraft);
    setBasicsErrors(errs);
    if (Object.keys(errs).length > 0) return;
    updateProfile(profileBasicsToPatch(basicsDraft));
    updateUser({ name: basicsDraft.fullName.trim() });
    setBasicsDraft(null);
  }

  function saveContact() {
    if (!contactState) return;
    const errs = validateContact(contactState.draft);
    setContactErrors(errs);
    if (Object.keys(errs).length > 0) return;
    let next: EmergencyContact[];
    if (contactState.id) {
      const base = contacts.find((c) => c.id === contactState.id);
      next = contacts.map((c) =>
        c.id === contactState.id ? contactFromDraft(contactState.draft, base?.priority ?? c.priority, base) : c,
      );
    } else {
      const priority = contacts.reduce((m, c) => Math.max(m, c.priority), 0) + 1;
      next = [...contacts, contactFromDraft(contactState.draft, priority)];
    }
    updateProfile({ emergencyContacts: next });
    setContactState(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Medical profile" subtitle="The identity and baseline details every other record hangs off." />

      {/* Identity + baseline details */}
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={profile.fullName} photoUrl={profile.photoUrl} size={60} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-mhl-title font-bold text-mhl-ink">{profile.fullName}</h2>
            {metaLine && <p className="mt-0.5 text-mhl-fine text-mhl-muted">{metaLine}</p>}
          </div>
          <Button
            variant="secondary"
            icon={<EditIcon size={18} />}
            onClick={() => {
              setBasicsDraft(profileToBasicsDraft(profile));
              setBasicsErrors({});
            }}
          >
            Edit
          </Button>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-mhl-rule pt-5 sm:grid-cols-3">
          <Detail label="Date of birth" value={profile.dateOfBirth ? formatDate(profile.dateOfBirth) : ""} />
          <Detail label="Sex" value={profile.sex ? SEX_LABELS[profile.sex] : ""} />
          <Detail label="Blood type" value={profile.bloodType} />
          <Detail label="Genotype" value={profile.genotype} />
          <Detail label="Height" value={profile.heightCm ? `${profile.heightCm} cm` : ""} />
          <Detail label="Weight" value={profile.weightKg ? `${profile.weightKg} kg` : ""} />
          <Detail label="Phone" value={profile.phone} />
          <Detail label="City" value={profile.city} />
          <Detail label="Sign-in email" value={user?.email} />
        </dl>
      </Card>

      {/* Emergency contacts */}
      <Section
        question="Who should we call in an emergency?"
        lead="The first person on this list shows on your emergency card."
        action={
          <Button
            variant="secondary"
            icon={<PlusIcon size={18} strokeWidth={2.25} />}
            onClick={() => {
              setContactState({ id: null, draft: emptyContactDraft() });
              setContactErrors({});
            }}
          >
            Add
          </Button>
        }
      >
        {contacts.length > 0 ? (
          <ul className="mt-4 divide-y divide-mhl-rule">
            {contacts.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
                  <UserIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-mhl-body font-semibold text-mhl-ink">
                    {c.name}
                    {i === 0 && <span className="ml-2 text-mhl-fine font-normal text-mhl-accent">Primary</span>}
                  </p>
                  <p className="truncate text-mhl-fine text-mhl-muted">
                    {[c.relationship, c.phone, c.altPhone].filter(Boolean).join("  ·  ")}
                  </p>
                </div>
                <IconButton
                  label={`Edit ${c.name}`}
                  onClick={() => {
                    setContactState({ id: c.id, draft: contactToDraft(c) });
                    setContactErrors({});
                  }}
                >
                  <EditIcon size={18} />
                </IconButton>
                <IconButton label={`Remove ${c.name}`} tone="danger" onClick={() => setContactToDelete(c)}>
                  <TrashIcon size={18} />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-4"
            icon={<PhoneIcon size={26} />}
            title="No emergency contact yet"
            description="Add someone a first responder can reach if you can't speak for yourself."
            action={
              <Button
                icon={<PlusIcon size={18} strokeWidth={2.25} />}
                onClick={() => {
                  setContactState({ id: null, draft: emptyContactDraft() });
                  setContactErrors({});
                }}
              >
                Add a contact
              </Button>
            }
          />
        )}
      </Section>

      <RecordEditModal<ProfileBasicsDraft>
        open={basicsDraft !== null}
        title="Edit your details"
        draft={basicsDraft}
        errors={basicsErrors}
        Fields={ProfileBasicsFields}
        onChange={(patch) => setBasicsDraft((d) => (d ? { ...d, ...patch } : d))}
        onSave={saveBasics}
        onClose={() => setBasicsDraft(null)}
      />

      <RecordEditModal<ContactDraft>
        open={contactState !== null}
        title={contactState?.id ? "Edit contact" : "Add emergency contact"}
        draft={contactState?.draft ?? null}
        errors={contactErrors}
        Fields={ContactFields}
        saveLabel={contactState?.id ? "Save changes" : "Add contact"}
        onChange={(patch) => setContactState((s) => (s ? { ...s, draft: { ...s.draft, ...patch } } : s))}
        onSave={saveContact}
        onClose={() => setContactState(null)}
      />

      <ConfirmDialog
        open={contactToDelete !== null}
        title="Remove this contact?"
        message={
          contactToDelete
            ? `${contactToDelete.name} will be removed from your emergency contacts.`
            : ""
        }
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (contactToDelete) {
            updateProfile({ emergencyContacts: contacts.filter((c) => c.id !== contactToDelete.id) });
          }
          setContactToDelete(null);
        }}
        onClose={() => setContactToDelete(null)}
      />
    </div>
  );
}
