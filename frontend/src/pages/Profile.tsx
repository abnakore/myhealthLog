import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useAuth } from "@/auth/AuthContext";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useAppMode } from "@/store/AppModeContext";
import { resetDemoData } from "@/lib/storage";
import { calcAge, formatDate } from "@/lib/format";
import { SEX_LABELS, bmiFrom, type EmergencyContact } from "@/types/health";
import {
  profileToBasicsDraft,
  validateProfileBasics,
  profileBasicsToPatch,
  locationToDraft,
  locationToPatch,
  emptyContactDraft,
  contactToDraft,
  validateContact,
  contactFromDraft,
  type ProfileBasicsDraft,
  type LocationDraft,
  type ContactDraft,
  type FieldErrors,
} from "@/components/records/model";
import { ProfileBasicsFields, LocationFields, ContactFields } from "@/components/records/FieldSets";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { ActionRow } from "@/components/profile/ActionRow";
import { ModeSwitchModal } from "@/components/profile/ModeSwitchModal";
import { DataExportModal } from "@/components/profile/DataExportModal";
import { useContexts } from "@/store/ContextsContext";
import { contextLabel, isPregnancy } from "@/lib/healthContexts";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import { FileDrop } from "@/components/ui/FileDrop";
import { useSharing } from "@/store/SharingContext";
import {
  CameraIcon,
  DownloadIcon,
  EditIcon,
  LinkIcon,
  MapPinIcon,
  PhoneIcon,
  PlusIcon,
  ShieldIcon,
  SlidersIcon,
  SproutIcon,
  ConditionIcon,
  StethoscopeIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { buttonStyles } from "@/components/ui/Button";

function Detail({ label, value, full = false }: { label: string; value: ReactNode; full?: boolean }) {
  return (
    <div className={cn("min-w-0", full && "col-span-2 sm:col-span-3")}>
      <dt className="text-mhl-fine text-mhl-muted">{label}</dt>
      <dd className="mt-0.5 text-mhl-body font-medium text-mhl-ink">{value || "—"}</dd>
    </div>
  );
}

/** The identity editor reuses the shared basics fields, but phone and city live in
    the location section now — hide them here so a field is never edited in two places. */
function IdentityFields(props: {
  draft: ProfileBasicsDraft;
  onChange: (patch: Partial<ProfileBasicsDraft>) => void;
  errors: FieldErrors;
}) {
  return <ProfileBasicsFields {...props} hidePhone hideCity />;
}

/** Pick or drop a photo, preview it round, and save — or clear the one on file.
    The chosen image becomes a data URL, so it works before any upload backend. */
function PhotoModal({
  open,
  name,
  currentUrl,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  currentUrl?: string;
  onClose: () => void;
  onSave: (url: string | undefined) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | undefined>(currentUrl);

  // Start each time from what's on file; clear any half-made choice from last time.
  useEffect(() => {
    if (open) {
      setFile(null);
      setPreview(currentUrl);
    }
  }, [open, currentUrl]);

  function pick(f: File | null) {
    setFile(f);
    if (!f) {
      setPreview(currentUrl); // cleared the new pick — fall back to the current photo
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(f);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update your photo"
      description="Shown on your profile and emergency card."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(preview)}>Save photo</Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <Avatar name={name} photoUrl={preview} size={96} />
        <div className="w-full">
          <FileDrop
            label="Choose a photo"
            accept="image/*"
            value={file}
            onChange={pick}
            hint="A clear, front-facing photo works best"
            optional
          />
        </div>
        {currentUrl && (
          <button
            type="button"
            onClick={() => onSave(undefined)}
            className="text-mhl-fine font-semibold text-mhl-danger hover:underline"
          >
            Remove current photo
          </button>
        )}
      </div>
    </Modal>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const { profile, conditions, updateProfile } = useRecords();
  const { meta: modeMeta } = useAppMode();
  const { providers, connections } = useSharing();
  const { contexts, active } = useContexts();
  // Everything on this page is the record's own details, so each control checks the
  // same permission: the owner's record, or a full-access proxy's.
  const { canEdit, isProxyView, activeOwnerName, invitedByMe } = useCareProxy();
  const ModeIcon = modeMeta.Icon;

  const [basicsDraft, setBasicsDraft] = useState<ProfileBasicsDraft | null>(null);
  const [basicsErrors, setBasicsErrors] = useState<FieldErrors>({});

  const [locationDraft, setLocationDraft] = useState<LocationDraft | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  const [contactState, setContactState] = useState<{ id: string | null; draft: ContactDraft } | null>(null);
  const [contactErrors, setContactErrors] = useState<FieldErrors>({});
  const [contactToDelete, setContactToDelete] = useState<EmergencyContact | null>(null);

  const [modeOpen, setModeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const age = calcAge(profile.dateOfBirth);
  const bmi = bmiFrom(profile.heightCm, profile.weightKg);
  const contacts = [...profile.emergencyContacts].sort((a, b) => a.priority - b.priority);
  const metaLine = [age != null ? `${age} yrs` : null, profile.sex ? SEX_LABELS[profile.sex] : null, profile.city]
    .filter(Boolean)
    .join("  ·  ");
  const hasLocation = Boolean(
    profile.phone || profile.city || profile.state || profile.country || profile.address,
  );

  function saveBasics() {
    if (!basicsDraft) return;
    const errs = validateProfileBasics(basicsDraft);
    setBasicsErrors(errs);
    if (Object.keys(errs).length > 0) return;
    // Phone and city are owned by the location section — don't let identity touch them.
    const patch = profileBasicsToPatch(basicsDraft);
    delete patch.phone;
    delete patch.city;
    updateProfile(patch);
    updateUser({ name: basicsDraft.fullName.trim() });
    setBasicsDraft(null);
  }

  function saveLocation() {
    if (!locationDraft) return;
    updateProfile(locationToPatch(locationDraft));
    setLocationDraft(null);
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

  function openLocation() {
    setLocationDraft(locationToDraft(profile));
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Medical profile" subtitle="The identity and baseline details every other record hangs off." />

      {/* Identity + baseline details */}
      <Card id="summary">
        <div className="flex items-center gap-4">
          <div className="relative flex-none">
            <Avatar name={profile.fullName} photoUrl={profile.photoUrl} size={64} />
            {canEdit && (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                aria-label="Change photo"
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-mhl-surface bg-mhl-accent text-white transition-colors hover:bg-mhl-accent-strong"
              >
                <CameraIcon size={14} />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-mhl-title font-bold text-mhl-ink">{profile.fullName}</h2>
            {metaLine && <p className="mt-0.5 text-mhl-fine text-mhl-muted">{metaLine}</p>}
          </div>
          {canEdit && (
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
          )}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-mhl-rule pt-5 sm:grid-cols-3">
          <Detail label="Date of birth" value={profile.dateOfBirth ? formatDate(profile.dateOfBirth) : ""} />
          <Detail label="Sex" value={profile.sex ? SEX_LABELS[profile.sex] : ""} />
          <Detail label="Blood type" value={profile.bloodType} />
          <Detail label="Genotype" value={profile.genotype} />
          <Detail label="Height" value={profile.heightCm ? `${profile.heightCm} cm` : ""} />
          <Detail label="Weight" value={profile.weightKg ? `${profile.weightKg} kg` : ""} />
          <Detail label="BMI" value={bmi != null ? `${bmi} kg/m²` : ""} />
          {/* Their sign-in address is not a proxy's to see — it isn't part of the record. */}
          {!isProxyView && <Detail label="Sign-in email" value={user?.email} />}
        </dl>
      </Card>

      {/* Location & contact details */}
      <Section
        icon={<MapPinIcon size={18} />}
        question="Where can we reach you?"
        lead="Your contact number and address."
        action={
          canEdit ? (
            <Button
              variant="secondary"
              icon={hasLocation ? <EditIcon size={18} /> : <PlusIcon size={18} strokeWidth={2.25} />}
              onClick={openLocation}
            >
              {hasLocation ? "Edit" : "Add"}
            </Button>
          ) : undefined
        }
      >
        {hasLocation ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Detail label="Phone" value={profile.phone} />
            <Detail label="City" value={profile.city} />
            <Detail label="State / region" value={profile.state} />
            <Detail label="Country" value={profile.country} />
            <Detail label="Address" value={profile.address} full />
          </dl>
        ) : (
          <EmptyState
            className="mt-4"
            icon={<MapPinIcon size={26} />}
            title="No contact details yet"
            description="Add a phone number and address so your record can reach you — and a responder can too."
            action={
              canEdit ? (
                <Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openLocation}>
                  Add contact details
                </Button>
              ) : undefined
            }
          />
        )}
      </Section>

      {/* Emergency contacts */}
      <Section
        icon={<PhoneIcon size={18} />}
        question="Who should we call in an emergency?"
        lead="The first person on this list shows on your emergency card."
        action={
          canEdit ? (
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
          ) : undefined
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
                {canEdit && (
                  <>
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
                  </>
                )}
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
              canEdit ? (
                <Button
                  icon={<PlusIcon size={18} strokeWidth={2.25} />}
                  onClick={() => {
                    setContactState({ id: null, draft: emptyContactDraft() });
                    setContactErrors({});
                  }}
                >
                  Add a contact
                </Button>
              ) : undefined
            }
          />
        )}
      </Section>

      {/* Sharing & safety — the owner's own controls. A proxy sees who has access
          named in words, without a single control that would change it. */}
      <Section
        icon={<ShieldIcon size={18} />}
        question="Who else needs in?"
        lead="Scoped access for doctors and labs, your care proxy, and the emergency card a responder can open."
      >
        {isProxyView ? (
          <p className="mt-3 rounded-mhl-sm bg-mhl-sunk px-3.5 py-3 text-mhl-fine text-mhl-muted">
            Only {activeOwnerName} can decide who sees this record. A care proxy can read it — handing
            it on to anyone else isn't theirs to do.
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            <ActionRow
              icon={<StethoscopeIcon size={20} />}
              title="Care providers"
              subtitle="Give a doctor or lab a code to read or fill in"
              to="/app/providers"
              trailing={providers.length > 0 ? <Tag tone="ok">{providers.length}</Tag> : undefined}
            />
            <ActionRow
              icon={<UsersIcon size={20} />}
              title="Care proxy"
              subtitle="Family who can open your record and act for you"
              to="/app/proxy"
              trailing={invitedByMe.length > 0 ? <Tag tone="ok">{invitedByMe.length}</Tag> : undefined}
            />
            <ActionRow
              icon={<ShieldIcon size={20} />}
              title="Emergency access"
              subtitle="The code, the optional PIN, and exactly what it reveals"
              to="/app/emergency"
            />
            <ActionRow
              icon={<LinkIcon size={20} />}
              title="Connected apps & devices"
              subtitle="Samsung Health and more, feeding readings in"
              to="/app/connections"
              trailing={connections.length > 0 ? <Tag tone="neutral">{connections.length}</Tag> : undefined}
            />
          </div>
        )}
      </Section>

      {/* Condition-aware profiles — the lenses over the record. Kept next to the app-mode
          section because they answer neighbouring questions: this one is *which
          condition to read the record through*, the next is *how the app should work*. */}
      <Section
        icon={<ConditionIcon size={18} />}
        question="Which condition should lead?"
        lead="Read your record through one condition at a time. Nothing is copied, hidden or moved — the full record is always here."
        action={
          <Link to="/app/contexts" className={buttonStyles("secondary", "md")}>
            Manage profiles
          </Link>
        }
      >
        {contexts.length === 0 ? (
          <p className="mt-3 rounded-mhl-sm bg-mhl-sunk px-3.5 py-3 text-mhl-fine text-mhl-muted">
            No profiles opened yet. Open one from a condition already on your record — or set up
            a pregnancy context.
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            {contexts.map((ctx) => (
              <ActionRow
                key={ctx.id}
                icon={isPregnancy(ctx) ? <SproutIcon size={20} /> : <ConditionIcon size={20} />}
                title={contextLabel(ctx, conditions)}
                subtitle="A condition-aware profile over this record"
                to={`/app/contexts/${ctx.id}`}
                trailing={active?.id === ctx.id ? <Tag tone="due">In focus</Tag> : undefined}
              />
            ))}
          </div>
        )}
      </Section>


      {/* Condition-aware mode */}
      <Section
        icon={<SlidersIcon size={18} />}
        question="How should the app work for you?"
        lead="Condition-aware modes reshape myHealthLog around what matters now — same record, different focus."
        action={
          <Button variant="secondary" icon={<SlidersIcon size={18} />} onClick={() => setModeOpen(true)}>
            Change mode
          </Button>
        }
      >
        <div className="mt-4 flex items-start gap-4 rounded-mhl-sm bg-mhl-sunk p-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
            <ModeIcon size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-mhl-body font-semibold text-mhl-ink">{modeMeta.label} mode</p>
            <p className="mt-0.5 text-mhl-fine text-mhl-muted">{modeMeta.blurb}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {modeMeta.focus.map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-mhl-surface px-2.5 py-1 text-[0.75rem] font-medium text-mhl-muted"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Data. Export stays with whoever may hold the record (the owner, or a
          full-access proxy taking a copy to an appointment); the demo reset is the
          signed-in user's own housekeeping, so it never shows in someone else's. */}
      {canEdit ? (
        <Section
          icon={<DownloadIcon size={18} />}
          question="Your data"
          lead={isProxyView ? `A copy of ${activeOwnerName}'s record — for a doctor, or another app.` : "Your record is yours to take anywhere."}
        >
          <div className="mt-2 space-y-1">
            <ActionRow
              icon={<DownloadIcon size={20} />}
              title="Export this record"
              subtitle="Download as FHIR, or a one-page clinical summary"
              onClick={() => setExportOpen(true)}
            />
          </div>
          {!isProxyView && (
            <div className="mt-4 border-t border-mhl-rule pt-3.5">
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="text-mhl-fine font-medium text-mhl-muted transition-colors hover:text-mhl-danger"
              >
                Reset to sample data
              </button>
            </div>
          )}
        </Section>
      ) : null}

      <RecordEditModal<ProfileBasicsDraft>
        open={basicsDraft !== null}
        title="Edit your details"
        draft={basicsDraft}
        errors={basicsErrors}
        Fields={IdentityFields}
        onChange={(patch) => setBasicsDraft((d) => (d ? { ...d, ...patch } : d))}
        onSave={saveBasics}
        onClose={() => setBasicsDraft(null)}
      />

      <RecordEditModal<LocationDraft>
        open={locationDraft !== null}
        title="Contact details"
        description="All optional — fill in what you're comfortable sharing."
        draft={locationDraft}
        errors={{}}
        Fields={LocationFields}
        onChange={(patch) => setLocationDraft((d) => (d ? { ...d, ...patch } : d))}
        onSave={saveLocation}
        onClose={() => setLocationDraft(null)}
      />

      <PhotoModal
        open={photoOpen}
        name={profile.fullName}
        currentUrl={profile.photoUrl}
        onClose={() => setPhotoOpen(false)}
        onSave={(url) => {
          updateProfile({ photoUrl: url });
          setPhotoOpen(false);
        }}
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

      <ModeSwitchModal open={modeOpen} onClose={() => setModeOpen(false)} />

      <DataExportModal open={exportOpen} onClose={() => setExportOpen(false)} />

      <ConfirmDialog
        open={resetOpen}
        title="Reset to sample data?"
        message="This clears the edits you've made in this demo and restores the original sample record. It won't sign you out."
        confirmLabel="Reset"
        danger
        onConfirm={() => {
          resetDemoData();
          window.location.reload();
        }}
        onClose={() => setResetOpen(false)}
      />
    </div>
  );
}
