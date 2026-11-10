/**
 * Provider access: the page a share link opens.
 *
 * Backed by POST /api/v1/sharing/provider-access/. No account required. The code
 * and its PIN are checked on the server, and the response carries only the
 * scopes the owner ticked.
 *
 * When the share is "View & fill in", every granted part of the record (basic
 * info, lists, documents, immunisations) can be added to or edited here with
 * the same forms the owner's own pages use, and the server checks the grant
 * again on every write. The window never shows, or writes, a scope the owner
 * did not share.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  openProviderAccess,
  addProviderNote,
  saveProviderRecord,
  providerPayload,
  toProviderItem,
  type ProviderAccessResult,
  type ProviderRecordData,
  type ProviderWritableScope,
} from "@/services/sharing";
import { apiErrorMessage } from "@/services/api";
import { calcAge, formatDate, formatRelative, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { toFrontendProfile, type BackendProfile } from "@/services/profile";
import {
  ALLERGY_SEVERITY_LABELS,
  CONDITION_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  SEX_LABELS,
  formatVitalValue,
  isCriticalAllergy,
  vitalName,
  type Allergy,
  type Appointment,
  type Condition,
  type HealthDocument,
  type HealthProfile,
  type Immunization,
  type Medication,
  type VitalReading,
} from "@/types/health";
import {
  SHARE_SCOPE_LABELS,
  providerAccessLabel,
  type ShareScope,
} from "@/types/sharing";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/fields";
import { Spinner } from "@/components/ui/Spinner";
import { RecordEditModal } from "@/components/records/RecordEditModal";
import { ConditionOptionsContext } from "@/components/records/conditionOptions";
import {
  DocumentFields,
  ImmunizationFields,
  ProfileBasicsFields,
} from "@/components/records/FieldSets";
import * as M from "@/components/records/model";
import type { FieldErrors } from "@/components/records/model";
import { findKind, type FieldSetComponentProps } from "@/components/records/registry";
import {
  AllergyIcon,
  CalendarIcon,
  CheckIcon,
  DocumentIcon,
  EditIcon,
  HeartPulseIcon,
  LockIcon,
  PillIcon,
  PlusIcon,
  ShieldIcon,
  UserIcon,
  VaccineIcon,
  VitalsIcon,
} from "@/components/icons";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LockedWindow({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-mhl-bg px-4 py-10">
      <div className="w-full max-w-md rounded-mhl border border-mhl-rule bg-mhl-surface p-6 shadow-mhl">{children}</div>
    </main>
  );
}

function InvalidWindow({ message }: { message?: string }) {
  useEffect(() => { document.title = "Care provider access: code not valid"; }, []);
  return (
    <LockedWindow>
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
        <ShieldIcon size={26} />
      </span>
      <h1 className="mt-4 text-center text-mhl-title font-bold text-mhl-ink">This access code isn't valid</h1>
      <p className="mt-2 text-center text-mhl-body text-mhl-muted">
        {message ?? "It may have expired, been revoked by the record's owner, or the link may be incomplete."}
      </p>
    </LockedWindow>
  );
}

function PinGate({
  code,
  onUnlock,
}: {
  code: string;
  onUnlock: (result: ProviderAccessResult, pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Care provider access: enter PIN"; }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pin.trim()) { setError("Enter the PIN."); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await openProviderAccess(code, pin.trim());
      onUnlock(result, pin.trim());
    } catch (err) {
      setError(apiErrorMessage(err));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LockedWindow>
      <form onSubmit={submit} className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
          <LockIcon size={24} />
        </span>
        <h1 className="mt-4 text-mhl-title font-bold text-mhl-ink">This access code is PIN-protected</h1>
        <p className="mt-2 text-mhl-body text-mhl-muted">Enter the PIN that came with the code.</p>
        <input
          type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8}
          value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null); }}
          aria-label="Access PIN" autoFocus
          className="mt-4 w-full rounded-mhl-sm border border-mhl-rule bg-mhl-sunk px-4 py-3 text-center text-mhl-lead font-bold tracking-[0.35em] text-mhl-ink outline-none focus:border-mhl-accent"
        />
        {error && <p role="alert" className="mt-2 text-mhl-fine text-mhl-danger">{error}</p>}
        <button type="submit" disabled={busy}
          className="mt-4 flex w-full min-h-11 items-center justify-center rounded-full bg-mhl-accent px-6 text-mhl-body font-bold text-white disabled:opacity-50">
          {busy ? "Checking..." : "Open record"}
        </button>
      </form>
    </LockedWindow>
  );
}

// ---------------------------------------------------------------------------
// Editors: one per writable part of the record
// ---------------------------------------------------------------------------

/**
 * Everything the window needs to add or edit one kind of record. The forms,
 * drafts and validation are the owner's own (model.ts / FieldSets.tsx), so a
 * provider never fills in a simplified second-class form.
 */
interface Editor {
  noun: string;
  empty: () => unknown;
  toDraft: (record: unknown) => unknown;
  validate: (draft: unknown) => FieldErrors;
  /** Build the app-shaped item that providerPayload() maps to the API. */
  fromDraft: (draft: unknown, record?: unknown) => unknown;
  Fields: ComponentType<FieldSetComponentProps<unknown>>;
  /** The file to upload alongside, for documents. */
  file?: (draft: unknown) => File | null;
}

const fromKind = (kind: string, noun: string, toDraft: (r: never) => unknown): Editor => {
  const k = findKind(kind)!;
  return {
    noun,
    empty: k.empty,
    toDraft: toDraft as (r: unknown) => unknown,
    validate: k.validate,
    fromDraft: (d, r) => k.fromDraft(d, r),
    Fields: k.Fields as Editor["Fields"],
  };
};

function BasicInfoFields(props: FieldSetComponentProps<unknown>) {
  return (
    <ProfileBasicsFields
      draft={props.draft as M.ProfileBasicsDraft}
      onChange={props.onChange as (p: Partial<M.ProfileBasicsDraft>) => void}
      errors={props.errors}
      hidePhone
      hideCity
    />
  );
}

const EDITORS: Record<ProviderWritableScope, Editor> = {
  profile: {
    noun: "basic info",
    empty: M.emptyProfileBasicsDraft,
    toDraft: (r) => M.profileToBasicsDraft(r as HealthProfile),
    validate: (d) => M.validateProfileBasics(d as M.ProfileBasicsDraft),
    fromDraft: (d, r) => {
      const patch = M.profileBasicsToPatch(d as M.ProfileBasicsDraft);
      // Weight is saved as a new reading, so only send it when it changed.
      if (r && patch.weightKg === (r as HealthProfile).weightKg) delete patch.weightKg;
      return patch;
    },
    Fields: BasicInfoFields,
  },
  allergies: fromKind("allergy", "allergy", M.allergyToDraft),
  medications: fromKind("medication", "medicine", M.medicationToDraft),
  conditions: fromKind("condition", "condition", M.conditionToDraft),
  measurements: fromKind("vital", "reading", M.vitalToDraft),
  appointments: fromKind("visit", "visit", M.appointmentToDraft),
  documents: {
    noun: "document",
    empty: () => M.emptyDocumentDraft("LAB_RESULT"),
    toDraft: (r) => M.documentToDraft(r as HealthDocument),
    validate: (d) => M.validateDocument(d as M.DocumentDraft),
    fromDraft: (d, r) => M.documentFromDraft(d as M.DocumentDraft, r as HealthDocument | undefined),
    Fields: DocumentFields as Editor["Fields"],
    file: (d) => (d as M.DocumentDraft).file ?? null,
  },
  immunizations: {
    noun: "immunisation",
    empty: M.emptyImmunizationDraft,
    toDraft: (r) => M.immunizationToDraft(r as Immunization),
    validate: (d) => M.validateImmunization(d as M.ImmunizationDraft),
    fromDraft: (d, r) => M.immunizationFromDraft(d as M.ImmunizationDraft, r as Immunization | undefined),
    Fields: ImmunizationFields as Editor["Fields"],
  },
};

const SCOPE_KEYS: Record<Exclude<ProviderWritableScope, "profile">, keyof ProviderRecordData> = {
  allergies: "allergies",
  medications: "medications",
  conditions: "conditions",
  measurements: "vitals",
  appointments: "appointments",
  documents: "documents",
  immunizations: "immunizations",
};

const SCOPE_ICONS: Record<ShareScope, ComponentType<{ size?: number }>> = {
  profile: UserIcon,
  allergies: AllergyIcon,
  medications: PillIcon,
  conditions: HeartPulseIcon,
  measurements: VitalsIcon,
  appointments: CalendarIcon,
  documents: DocumentIcon,
  immunizations: VaccineIcon,
};

const SCOPE_ORDER: ShareScope[] = [
  "profile",
  "allergies",
  "medications",
  "conditions",
  "measurements",
  "appointments",
  "documents",
  "immunizations",
];

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

function SectionCard({
  id,
  scope,
  count,
  onAdd,
  addLabel,
  children,
}: {
  id: string;
  scope: ShareScope;
  count?: number;
  onAdd?: () => void;
  addLabel?: string;
  children: ReactNode;
}) {
  const Icon = SCOPE_ICONS[scope];
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 rounded-mhl border border-mhl-rule bg-mhl-surface shadow-mhl">
      <header className="flex items-center gap-3 border-b border-mhl-rule px-4 py-3 sm:px-5">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
          <Icon size={18} />
        </span>
        <h2 id={`${id}-title`} className="min-w-0 flex-1 text-mhl-card font-bold text-mhl-ink">
          {SHARE_SCOPE_LABELS[scope]}
          {count != null && <span className="ml-2 text-mhl-fine font-medium text-mhl-faint">{count}</span>}
        </h2>
        {onAdd && (
          <Button size="md" icon={<PlusIcon size={15} strokeWidth={2.4} />} onClick={onAdd}>
            {addLabel ?? "Add"}
          </Button>
        )}
      </header>
      <div className="px-4 py-2 sm:px-5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-mhl-fine text-mhl-muted">{label}</span>
      <span className="text-right text-mhl-body font-medium text-mhl-ink">{value}</span>
    </div>
  );
}

function Item({
  title,
  meta,
  badge,
  onEdit,
  editLabel,
}: {
  title: string;
  meta?: string;
  badge?: ReactNode;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-mhl-body font-semibold text-mhl-ink">
          <span className="min-w-0 break-words">{title}</span>
          {badge}
        </p>
        {meta && <p className="mt-0.5 text-mhl-fine text-mhl-muted">{meta}</p>}
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel ?? `Edit ${title}`}
          className="inline-flex min-h-9 flex-none items-center gap-1.5 rounded-full border border-mhl-rule px-3 text-mhl-fine font-semibold text-mhl-ink transition-colors hover:border-mhl-accent/50 hover:bg-mhl-accent-lo/50"
        >
          <EditIcon size={14} />
          Edit
        </button>
      )}
    </li>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-mhl-rule">{children}</ul>;
}

function Empty({ children, canAdd }: { children: string; canAdd?: boolean }) {
  return (
    <p className="py-4 text-mhl-fine text-mhl-muted">
      {children}
      {canAdd ? " Use Add to put the first one on the record." : ""}
    </p>
  );
}

function MoreToggle({ shown, total, limit, onToggle }: { shown: boolean; total: number; limit: number; onToggle: () => void }) {
  if (total <= limit) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-2 mt-1 text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
    >
      {shown ? "Show fewer" : `Show all ${total}`}
    </button>
  );
}

function Pill({ tone = "neutral", children }: { tone?: "neutral" | "alert"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.72rem] font-semibold",
        tone === "alert" ? "bg-mhl-danger-lo text-mhl-danger" : "bg-mhl-sunk text-mhl-muted",
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Access window
// ---------------------------------------------------------------------------

interface Editing {
  scope: ProviderWritableScope;
  id?: string;
  draft: unknown;
  record?: unknown;
}

const LIST_LIMIT = 5;

function AccessWindow({ code, pin, result }: { code: string; pin: string; result: ProviderAccessResult }) {
  const { provider } = result;
  const [record, setRecord] = useState<ProviderRecordData>(result.record);
  const has = (scope: ShareScope) => provider.scopes.includes(scope);
  const canEdit = provider.access === "CONTRIBUTE";
  const shared = SCOPE_ORDER.filter(has);

  const profile = useMemo<HealthProfile | null>(
    () => (record.profile ? toFrontendProfile(record.profile as unknown as BackendProfile) : null),
    [record.profile],
  );
  const age = calcAge(profile?.dateOfBirth);

  const [showAll, setShowAll] = useState<Partial<Record<ShareScope, boolean>>>({});
  const toggleAll = (scope: ShareScope) => setShowAll((prev) => ({ ...prev, [scope]: !prev[scope] }));
  const limited = <T,>(scope: ShareScope, list: T[]) => (showAll[scope] ? list : list.slice(0, LIST_LIMIT));

  // Fixed when the window opens, so "upcoming" doesn't shift between renders.
  const [now] = useState(() => Date.now());
  const appointments = useMemo(
    () =>
      [...record.appointments].sort((a, b) => {
        // Upcoming first (soonest first), then past visits (most recent first).
        const ta = +new Date(a.scheduledFor);
        const tb = +new Date(b.scheduledFor);
        const fa = ta >= now;
        const fb = tb >= now;
        if (fa !== fb) return fa ? -1 : 1;
        return fa ? ta - tb : tb - ta;
      }),
    [record.appointments, now],
  );
  const vitals = useMemo(
    () => [...record.vitals].sort((a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt)),
    [record.vitals],
  );
  const documents = useMemo(
    () => [...record.documents].sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt)),
    [record.documents],
  );

  const [editing, setEditing] = useState<Editing | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Care provider access: ${profile?.fullName || "Record"}`;
  }, [profile]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 3200);
    return () => window.clearTimeout(t);
  }, [flash]);

  function openEditor(scope: ProviderWritableScope, existing?: unknown) {
    const editor = EDITORS[scope];
    setSaveError(null);
    setErrors({});
    setEditing({
      scope,
      id: existing && scope !== "profile" ? (existing as { id: string }).id : undefined,
      draft: existing ? editor.toDraft(existing) : editor.empty(),
      record: existing,
    });
  }

  async function saveEditor() {
    if (!editing) return;
    const editor = EDITORS[editing.scope];
    const errs = editor.validate(editing.draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      const item = editor.fromDraft(editing.draft, editing.record);
      const isUpdate = editing.scope === "profile" || Boolean(editing.id);
      const raw = await saveProviderRecord(
        code,
        editing.scope,
        isUpdate ? "update" : "create",
        providerPayload(editing.scope, item),
        pin,
        editing.id,
        editor.file?.(editing.draft) ?? null,
      );
      if (editing.scope === "profile") {
        setRecord((prev) => ({ ...prev, profile: raw as Record<string, unknown> }));
      } else {
        const saved = toProviderItem(editing.scope, raw);
        const key = SCOPE_KEYS[editing.scope];
        setRecord((prev) => {
          const list = prev[key] as unknown[];
          const next = editing.id
            ? list.map((r) => ((r as { id: string }).id === editing.id ? saved : r))
            : [saved, ...list];
          return { ...prev, [key]: next };
        });
      }
      setFlash(isUpdate ? "Saved to the record." : "Added to the record.");
      setEditing(null);
    } catch (err) {
      setSaveError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const res = await addProviderNote(code, noteText.trim(), pin);
      const now = new Date().toISOString();
      const note: HealthDocument = {
        id: res.document_id,
        title: `Note from ${provider.name}`,
        docType: "OTHER",
        fileName: "",
        fileSize: 0,
        uploadedAt: now,
        notes: noteText.trim(),
      };
      setRecord((prev) => ({ ...prev, documents: [note, ...prev.documents] }));
      setNoteText("");
      setFlash("Note added to the record.");
    } catch (err) {
      setNoteError(apiErrorMessage(err));
    } finally {
      setNoteSaving(false);
    }
  }

  const add = (scope: ProviderWritableScope) => (canEdit ? () => openEditor(scope) : undefined);
  const edit = (scope: ProviderWritableScope, item: unknown) => (canEdit ? () => openEditor(scope, item) : undefined);

  const counts: Partial<Record<ShareScope, number>> = {
    allergies: record.allergies.length,
    medications: record.medications.length,
    conditions: record.conditions.length,
    measurements: record.vitals.length,
    appointments: record.appointments.length,
    documents: record.documents.length,
    immunizations: record.immunizations.length,
  };

  const editor = editing ? EDITORS[editing.scope] : undefined;
  const ownerConditions = record.conditions;

  return (
    <main className="min-h-dvh bg-mhl-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-mhl-rule bg-mhl-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-[0.55rem] bg-mhl-accent text-white">
            <PlusIcon size={17} strokeWidth={2.5} />
          </span>
          <span className="text-mhl-body font-bold tracking-[-0.02em] text-mhl-ink">myHealthLog</span>
          <span className="hidden text-mhl-fine text-mhl-faint sm:inline">Care provider window</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-mhl-accent/30 bg-mhl-accent-lo px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-mhl-accent">
            {provider.pinEnabled && <LockIcon size={11} />}
            {canEdit ? "View & fill in" : "View only"}
          </span>
        </div>
        {/* Jump links to each shared section */}
        {shared.length > 1 && (
          <nav aria-label="Shared sections" className="mx-auto max-w-3xl overflow-x-auto px-4 pb-2.5">
            <ul className="flex w-max gap-1.5">
              {shared.map((scope) => (
                <li key={scope}>
                  <a
                    href={`#sec-${scope}`}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-mhl-rule bg-mhl-surface px-3 text-mhl-fine font-semibold text-mhl-muted transition-colors hover:border-mhl-accent/50 hover:text-mhl-ink"
                  >
                    {SHARE_SCOPE_LABELS[scope]}
                    {counts[scope] != null && <span className="text-mhl-faint">{counts[scope]}</span>}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {/* Who this is, and on what terms */}
        <section className="rounded-mhl border border-mhl-rule bg-mhl-surface p-4 shadow-mhl sm:p-5">
          <p className="text-mhl-fine text-mhl-muted">Shared record of</p>
          <h1 className="mt-0.5 text-mhl-title font-bold text-mhl-ink">{profile?.fullName || "This person"}</h1>
          {profile && (
            <p className="mt-1 text-mhl-body text-mhl-muted">
              {[
                age != null ? `${age} yrs` : null,
                profile.sex ? SEX_LABELS[profile.sex] : null,
                profile.bloodType ? `Blood ${profile.bloodType}` : null,
                profile.genotype ? `Genotype ${profile.genotype}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-mhl-rule pt-3 text-mhl-fine text-mhl-muted">
            <span>
              Opened by <span className="font-semibold text-mhl-ink">{provider.name}</span>
              {provider.facility ? `, ${provider.facility}` : ""}
            </span>
            <span className="text-mhl-faint">{providerAccessLabel(provider.access)}</span>
          </div>
          {canEdit && (
            <p className="mt-3 flex items-start gap-2 rounded-mhl-sm bg-mhl-accent-lo px-3 py-2.5 text-mhl-fine text-mhl-ink">
              <EditIcon size={15} className="mt-0.5 flex-none text-mhl-accent" />
              <span>
                You can add and update every section below. Each change is saved to the record under your name and the owner is told.
              </span>
            </p>
          )}
        </section>

        <div aria-live="polite">
          {flash && (
            <div className="flex items-center gap-2 rounded-mhl-sm bg-mhl-good-lo px-4 py-2.5 text-mhl-fine font-semibold text-mhl-good">
              <CheckIcon size={16} strokeWidth={2.25} />
              {flash}
            </div>
          )}
        </div>

        {has("profile") && (
          <SectionCard
            id="sec-profile"
            scope="profile"
            onAdd={canEdit ? () => openEditor("profile", profile ?? undefined) : undefined}
            addLabel={profile ? "Edit" : "Add"}
          >
            {profile ? (
              <div className="divide-y divide-mhl-rule">
                <Row label="Full name" value={profile.fullName || "Not recorded"} />
                <Row label="Date of birth" value={profile.dateOfBirth ? formatDate(profile.dateOfBirth) : "Not recorded"} />
                <Row label="Sex" value={profile.sex ? SEX_LABELS[profile.sex] : "Not recorded"} />
                <Row label="Blood type" value={profile.bloodType ?? "Not recorded"} />
                <Row label="Genotype" value={profile.genotype ?? "Not recorded"} />
                {profile.heightCm != null && <Row label="Height" value={`${profile.heightCm} cm`} />}
                {profile.weightKg != null && <Row label="Weight" value={`${profile.weightKg} kg`} />}
              </div>
            ) : (
              <Empty canAdd={canEdit}>No basic info on file.</Empty>
            )}
          </SectionCard>
        )}

        {has("allergies") && (
          <SectionCard id="sec-allergies" scope="allergies" count={counts.allergies} onAdd={add("allergies")} addLabel="Add allergy">
            {record.allergies.length === 0 ? (
              <Empty canAdd={canEdit}>No allergies recorded.</Empty>
            ) : (
              <>
                <List>
                  {limited("allergies", record.allergies).map((a: Allergy) => (
                    <Item
                      key={a.id}
                      title={a.substance}
                      badge={<Pill tone={isCriticalAllergy(a.severity) ? "alert" : "neutral"}>{ALLERGY_SEVERITY_LABELS[a.severity]}</Pill>}
                      meta={a.reactions?.length ? a.reactions.join(", ") : undefined}
                      onEdit={edit("allergies", a)}
                      editLabel={`Edit allergy: ${a.substance}`}
                    />
                  ))}
                </List>
                <MoreToggle shown={!!showAll.allergies} total={record.allergies.length} limit={LIST_LIMIT} onToggle={() => toggleAll("allergies")} />
              </>
            )}
          </SectionCard>
        )}

        {has("medications") && (
          <SectionCard id="sec-medications" scope="medications" count={counts.medications} onAdd={add("medications")} addLabel="Add medicine">
            {record.medications.length === 0 ? (
              <Empty canAdd={canEdit}>No medicines recorded.</Empty>
            ) : (
              <>
                <List>
                  {limited("medications", [...record.medications].sort((a, b) => Number(b.active) - Number(a.active))).map((m: Medication) => (
                    <Item
                      key={m.id}
                      title={m.name}
                      badge={m.active ? undefined : <Pill>Stopped</Pill>}
                      meta={[m.dosage, m.frequency].filter(Boolean).join(" · ") || undefined}
                      onEdit={edit("medications", m)}
                      editLabel={`Edit medicine: ${m.name}`}
                    />
                  ))}
                </List>
                <MoreToggle shown={!!showAll.medications} total={record.medications.length} limit={LIST_LIMIT} onToggle={() => toggleAll("medications")} />
              </>
            )}
          </SectionCard>
        )}

        {has("conditions") && (
          <SectionCard id="sec-conditions" scope="conditions" count={counts.conditions} onAdd={add("conditions")} addLabel="Add condition">
            {record.conditions.length === 0 ? (
              <Empty canAdd={canEdit}>No conditions recorded.</Empty>
            ) : (
              <>
                <List>
                  {limited("conditions", record.conditions).map((c: Condition) => (
                    <Item
                      key={c.id}
                      title={c.name}
                      badge={<Pill>{CONDITION_STATUS_LABELS[c.status] ?? c.status}</Pill>}
                      meta={c.onsetDate ? `Since ${formatDate(c.onsetDate)}` : undefined}
                      onEdit={edit("conditions", c)}
                      editLabel={`Edit condition: ${c.name}`}
                    />
                  ))}
                </List>
                <MoreToggle shown={!!showAll.conditions} total={record.conditions.length} limit={LIST_LIMIT} onToggle={() => toggleAll("conditions")} />
              </>
            )}
          </SectionCard>
        )}

        {has("measurements") && (
          <SectionCard id="sec-measurements" scope="measurements" count={counts.measurements} onAdd={add("measurements")} addLabel="Add reading">
            {vitals.length === 0 ? (
              <Empty canAdd={canEdit}>No readings recorded.</Empty>
            ) : (
              <>
                <List>
                  {limited("measurements", vitals).map((v: VitalReading) => (
                    <Item
                      key={v.id}
                      title={`${vitalName(v)}: ${formatVitalValue(v)}`}
                      meta={`${formatDate(v.measuredAt)}, ${formatTime(v.measuredAt)}`}
                      onEdit={edit("measurements", v)}
                      editLabel={`Edit reading: ${vitalName(v)}`}
                    />
                  ))}
                </List>
                <MoreToggle shown={!!showAll.measurements} total={vitals.length} limit={LIST_LIMIT} onToggle={() => toggleAll("measurements")} />
              </>
            )}
          </SectionCard>
        )}

        {has("appointments") && (
          <SectionCard id="sec-appointments" scope="appointments" count={counts.appointments} onAdd={add("appointments")} addLabel="Add visit">
            {appointments.length === 0 ? (
              <Empty canAdd={canEdit}>No visits recorded.</Empty>
            ) : (
              <>
                <List>
                  {limited("appointments", appointments).map((a: Appointment) => (
                    <Item
                      key={a.id}
                      title={a.title}
                      badge={<Pill>{+new Date(a.scheduledFor) >= now ? "Upcoming" : a.status === "SCHEDULED" ? "Past" : a.status.charAt(0) + a.status.slice(1).toLowerCase()}</Pill>}
                      meta={[formatDate(a.scheduledFor), formatTime(a.scheduledFor), a.facility].filter(Boolean).join(" · ")}
                      onEdit={edit("appointments", a)}
                      editLabel={`Edit visit: ${a.title}`}
                    />
                  ))}
                </List>
                <MoreToggle shown={!!showAll.appointments} total={appointments.length} limit={LIST_LIMIT} onToggle={() => toggleAll("appointments")} />
              </>
            )}
          </SectionCard>
        )}

        {has("documents") && (
          <SectionCard id="sec-documents" scope="documents" count={counts.documents} onAdd={add("documents")} addLabel="Add document">
            {documents.length === 0 ? (
              <Empty canAdd={canEdit}>No documents on file.</Empty>
            ) : (
              <>
                <List>
                  {limited("documents", documents).map((d: HealthDocument) => (
                    <Item
                      key={d.id}
                      title={d.title}
                      badge={<Pill>{DOCUMENT_TYPE_LABELS[d.docType]}</Pill>}
                      meta={[d.documentDate ? formatDate(d.documentDate) : formatRelative(d.uploadedAt), d.labName ?? d.provider, d.fileName || null].filter(Boolean).join(" · ")}
                      onEdit={d.fileName ? edit("documents", d) : undefined}
                      editLabel={`Edit document: ${d.title}`}
                    />
                  ))}
                </List>
                <MoreToggle shown={!!showAll.documents} total={documents.length} limit={LIST_LIMIT} onToggle={() => toggleAll("documents")} />
              </>
            )}

            {canEdit && (
              <form onSubmit={submitNote} className="mb-3 mt-2 rounded-mhl-sm bg-mhl-sunk p-3">
                <p className="text-mhl-fine font-semibold text-mhl-ink">Quick clinical note</p>
                <p className="mt-0.5 text-mhl-fine text-mhl-muted">Filed as a document under your name. No file needed.</p>
                <div className="mt-2">
                  <TextArea
                    label="Clinical note"
                    rows={3}
                    placeholder="Examination findings, instructions, lab order"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                </div>
                {noteError && <p role="alert" className="mt-1 text-mhl-fine text-mhl-danger">{noteError}</p>}
                <div className="mt-2">
                  <Button type="submit" variant="secondary" size="md" loading={noteSaving} disabled={noteSaving || !noteText.trim()}>
                    Add note
                  </Button>
                </div>
              </form>
            )}
          </SectionCard>
        )}

        {has("immunizations") && (
          <SectionCard id="sec-immunizations" scope="immunizations" count={counts.immunizations} onAdd={add("immunizations")} addLabel="Add immunisation">
            {record.immunizations.length === 0 ? (
              <Empty canAdd={canEdit}>No immunisations on file.</Empty>
            ) : (
              <>
                <List>
                  {limited("immunizations", record.immunizations).map((im: Immunization) => (
                    <Item
                      key={im.id}
                      title={im.vaccine}
                      meta={[
                        formatDate(im.administeredOn),
                        im.doseNumber ? `Dose ${im.doseNumber}` : null,
                        im.nextDue ? `Next due ${formatDate(im.nextDue)}` : null,
                      ].filter(Boolean).join(" · ")}
                      onEdit={edit("immunizations", im)}
                      editLabel={`Edit immunisation: ${im.vaccine}`}
                    />
                  ))}
                </List>
                <MoreToggle shown={!!showAll.immunizations} total={record.immunizations.length} limit={LIST_LIMIT} onToggle={() => toggleAll("immunizations")} />
              </>
            )}
          </SectionCard>
        )}

        <p className="pb-6 pt-2 text-center text-mhl-fine text-mhl-faint">
          This window shows only what the record owner chose to share. For anything else, ask them directly.
        </p>
      </div>

      {editing && editor && (
        <ConditionOptionsContext.Provider value={ownerConditions}>
          <RecordEditModal
            open
            title={editing.scope === "profile" ? "Edit basic info" : `${editing.id ? "Edit" : "Add"} ${editor.noun}`}
            description={editing.id || editing.scope === "profile" ? undefined : "This is added to the record under your name."}
            draft={editing.draft}
            errors={errors}
            Fields={editor.Fields}
            onChange={(patch) =>
              setEditing((prev) =>
                prev ? { ...prev, draft: { ...(prev.draft as object), ...(patch as object) } } : prev,
              )
            }
            onSave={saveEditor}
            onClose={() => { setEditing(null); setErrors({}); setSaveError(null); }}
            saveLabel={saving ? "Saving..." : "Save to record"}
            error={saveError}
          />
        </ConditionOptionsContext.Provider>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ProviderAccess() {
  const { code = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [needsPin, setNeedsPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProviderAccessResult | null>(null);
  const [pin, setPin] = useState("");
  const tried = useRef(false);

  useEffect(() => {
    if (!code || tried.current) return;
    tried.current = true;
    openProviderAccess(code)
      .then((r) => setResult(r))
      .catch((err) => {
        const msg = apiErrorMessage(err);
        // 400 with "PIN" usually means wrong pin or pin required
        if (msg.toLowerCase().includes("pin") || msg.toLowerCase().includes("incorrect")) {
          setNeedsPin(true);
        } else {
          setError(msg);
        }
      })
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-mhl-bg">
        <Spinner size={28} />
      </main>
    );
  }

  if (error) return <InvalidWindow message={error} />;
  if (needsPin && !result) {
    return (
      <PinGate
        code={code}
        onUnlock={(r, usedPin) => { setPin(usedPin); setResult(r); setNeedsPin(false); }}
      />
    );
  }
  if (!result) return <InvalidWindow />;
  return <AccessWindow code={code} pin={pin} result={result} />;
}
