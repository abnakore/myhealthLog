/**
 * Provider access — the page a share link opens.
 *
 * Backed by the real backend: POST /api/v1/sharing/provider-access/.
 * No account required. The code and its PIN are validated server-side, and the
 * response carries only the scopes the owner ticked.
 *
 * When the share is "View & fill in", every granted record type can be added to
 * or edited from this window — the same forms the owner's own pages use — and
 * the write is checked against the grant again on the server. The window never
 * shows, and never writes, a scope the owner did not share.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import { formatDate, formatRelative, formatTime } from "@/lib/format";
import {
  ALLERGY_SEVERITY_LABELS,
  CONDITION_STATUS_LABELS,
  formatVitalValue,
  vitalName,
  type Allergy,
  type Appointment,
  type Condition,
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
import type { FieldErrors } from "@/components/records/model";
import {
  allergyToDraft,
  appointmentToDraft,
  conditionToDraft,
  medicationToDraft,
  vitalToDraft,
} from "@/components/records/model";
import { findKind, type KindConfig } from "@/components/records/registry";
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
  useEffect(() => { document.title = "Care provider access — code not valid"; }, []);
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

  useEffect(() => { document.title = "Care provider access — enter PIN"; }, []);

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
          {busy ? "Verifying…" : "Open record"}
        </button>
      </form>
    </LockedWindow>
  );
}

// ---------------------------------------------------------------------------
// Record rendering helpers
// ---------------------------------------------------------------------------

function Block({
  icon,
  title,
  onAdd,
  addLabel,
  children,
}: {
  icon: ReactNode;
  title: string;
  onAdd?: () => void;
  addLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-mhl-rule px-5 py-4 first:border-t-0">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-2 text-mhl-fine font-semibold text-mhl-muted">
          {icon}<span>{title}</span>
        </span>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-full bg-mhl-accent-lo px-2.5 text-[0.78rem] font-semibold text-mhl-accent transition-colors hover:bg-mhl-accent/15"
          >
            <PlusIcon size={14} strokeWidth={2.4} />
            {addLabel ?? "Add"}
          </button>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-mhl-fine text-mhl-muted">{label}</span>
      <span className="text-right text-mhl-fine font-medium text-mhl-ink">{value}</span>
    </div>
  );
}

function Item({
  title,
  meta,
  onEdit,
  editLabel,
}: {
  title: string;
  meta?: string;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-mhl-body font-medium text-mhl-ink">{title}</p>
        {meta && <p className="text-mhl-fine text-mhl-muted">{meta}</p>}
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel ?? `Edit ${title}`}
          className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full text-mhl-muted transition-colors hover:bg-mhl-sunk hover:text-mhl-ink"
        >
          <EditIcon size={16} />
        </button>
      )}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="py-1 text-mhl-fine text-mhl-muted">{children}</p>;
}

// The forms the window reuses for a granted record type. They are the same
// field sets the owner's own Add/Edit pages render, so a provider never gets a
// simplified second-class form.
const EDIT_KINDS: Partial<Record<ProviderWritableScope, KindConfig>> = {
  allergies: findKind("allergy"),
  medications: findKind("medication"),
  conditions: findKind("condition"),
  measurements: findKind("vital"),
  appointments: findKind("visit"),
};

const SCOPE_KEYS: Record<ProviderWritableScope, keyof ProviderRecordData> = {
  allergies: "allergies",
  medications: "medications",
  conditions: "conditions",
  measurements: "vitals",
  appointments: "appointments",
  documents: "documents",
  immunizations: "immunizations",
};

function seedDraft(scope: ProviderWritableScope, record: unknown): unknown {
  switch (scope) {
    case "allergies":
      return allergyToDraft(record as Allergy);
    case "medications":
      return medicationToDraft(record as Medication);
    case "conditions":
      return conditionToDraft(record as Condition);
    case "measurements":
      return vitalToDraft(record as VitalReading);
    case "appointments":
      return appointmentToDraft(record as Appointment);
    default:
      return {};
  }
}

function scopeFor(scope: ShareScope): ProviderWritableScope | null {
  if (
    scope === "allergies" ||
    scope === "medications" ||
    scope === "conditions" ||
    scope === "measurements" ||
    scope === "appointments" ||
    scope === "documents" ||
    scope === "immunizations"
  ) {
    return scope;
  }
  return null;
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

function AccessWindow({ code, pin, result }: { code: string; pin: string; result: ProviderAccessResult }) {
  const { provider } = result;
  const [record, setRecord] = useState<ProviderRecordData>(result.record);
  const has = (scope: ShareScope) => provider.scopes.includes(scope);
  const canEdit = provider.access === "CONTRIBUTE";

  const profile = record.profile;
  const upcoming = record.appointments
    .filter((a) => a.status === "SCHEDULED")
    .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor));
  const latestVitals = record.vitals.slice(0, 5);
  const recentDocs = record.documents.slice(0, 5);

  const [editing, setEditing] = useState<Editing | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Care provider access — ${String(profile?.full_name ?? "Record")}`;
  }, [profile]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 3200);
    return () => window.clearTimeout(t);
  }, [flash]);

  function openEditor(scope: ProviderWritableScope, existing?: unknown) {
    if (!EDIT_KINDS[scope]) return;
    setSaveError(null);
    setErrors({});
    setEditing({
      scope,
      id: existing ? (existing as { id: string }).id : undefined,
      draft: existing ? seedDraft(scope, existing) : EDIT_KINDS[scope]!.empty(),
      record: existing,
    });
  }

  async function saveEditor() {
    if (!editing) return;
    const kind = EDIT_KINDS[editing.scope];
    if (!kind) return;
    const errs = kind.validate(editing.draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      const item = kind.fromDraft(editing.draft, editing.record);
      const raw = await saveProviderRecord(
        code,
        editing.scope,
        editing.id ? "update" : "create",
        providerPayload(editing.scope, item),
        pin,
        editing.id,
      );
      const saved = toProviderItem(editing.scope, raw);
      const key = SCOPE_KEYS[editing.scope];
      setRecord((prev) => {
        const list = prev[key] as unknown[];
        const next = editing.id
          ? list.map((r) => ((r as { id: string }).id === editing.id ? saved : r))
          : [saved, ...list];
        return { ...prev, [key]: next };
      });
      setFlash(editing.id ? "Saved to the record." : "Added to the record.");
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
      await addProviderNote(code, noteText.trim(), pin);
      setNoteSaved(true);
      setNoteText("");
    } catch (err) {
      setNoteError(apiErrorMessage(err));
    } finally {
      setNoteSaving(false);
    }
  }

  const addButton = (scope: ShareScope) => {
    const writable = scopeFor(scope);
    if (!canEdit || !writable || !EDIT_KINDS[writable]) return undefined;
    return () => openEditor(writable);
  };

  const editButton = (scope: ShareScope, item: unknown) => {
    const writable = scopeFor(scope);
    if (!canEdit || !writable || !EDIT_KINDS[writable]) return undefined;
    return () => openEditor(writable, item);
  };

  const editingKind = editing ? EDIT_KINDS[editing.scope] : undefined;

  return (
    <main className="grid min-h-dvh place-items-center bg-mhl-bg px-4 py-10">
      <div className="w-full max-w-xl">
        <header className="mb-4 flex items-center gap-3 rounded-mhl border border-mhl-rule bg-mhl-surface px-5 py-4 shadow-mhl">
          <span className="grid h-9 w-9 place-items-center rounded-[0.6rem] bg-mhl-accent text-white">
            <PlusIcon size={19} strokeWidth={2.5} />
          </span>
          <span className="text-mhl-card font-bold tracking-[-0.02em] text-mhl-ink">myHealthLog</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-mhl-accent/30 bg-mhl-accent-lo px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-mhl-accent">
            {provider.pinEnabled && <LockIcon size={11} />}
            {provider.pinEnabled ? "PIN protected" : "Limited access"}
          </span>
        </header>

        <div className="overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface shadow-mhl">
          <div className="bg-mhl-sunk px-5 py-4">
            <p className="text-mhl-fine text-mhl-muted">You are viewing part of the record of</p>
            <h1 className="mt-0.5 text-mhl-title font-bold text-mhl-ink">
              {String(profile?.full_name ?? "This person")}
            </h1>
            <p className="mt-1 text-mhl-fine text-mhl-muted">
              {provider.name}{provider.facility ? ` · ${provider.facility}` : ""}{" "}—{" "}
              {providerAccessLabel(provider.access)}
            </p>
            {canEdit && (
              <p className="mt-2 flex items-center gap-1.5 text-mhl-fine font-medium text-mhl-accent">
                <EditIcon size={14} />
                You can add and edit the sections below. Only the parts the owner shared are open to you.
              </p>
            )}
          </div>

          {flash && (
            <div className="flex items-center gap-2 border-t border-mhl-rule bg-mhl-good-lo px-5 py-2.5 text-mhl-fine font-semibold text-mhl-good">
              <CheckIcon size={16} strokeWidth={2.25} />
              {flash}
            </div>
          )}

          {has("profile") && profile && (
            <Block icon={<UserIcon size={17} />} title={SHARE_SCOPE_LABELS.profile}>
              <div className="space-y-1.5">
                {profile.full_name ? <Row label="Full name" value={String(profile.full_name)} /> : null}
                {profile.date_of_birth ? <Row label="Date of birth" value={formatDate(String(profile.date_of_birth))} /> : null}
                {profile.sex ? <Row label="Sex" value={String(profile.sex)} /> : null}
                {profile.blood_type ? <Row label="Blood type" value={String(profile.blood_type)} /> : null}
                {profile.genotype ? <Row label="Genotype" value={String(profile.genotype)} /> : null}
              </div>
            </Block>
          )}

          {has("allergies") && (
            <Block
              icon={<AllergyIcon size={17} />}
              title={SHARE_SCOPE_LABELS.allergies}
              onAdd={addButton("allergies")}
              addLabel="Add allergy"
            >
              {record.allergies.length === 0
                ? <Empty>No allergies recorded.</Empty>
                : record.allergies.map((a) => (
                  <Item key={a.id} title={a.substance}
                    meta={`${ALLERGY_SEVERITY_LABELS[a.severity]}${a.reactions?.length ? ` · ${a.reactions.join(", ")}` : ""}`}
                    onEdit={editButton("allergies", a)}
                    editLabel={`Edit allergy: ${a.substance}`} />
                ))}
            </Block>
          )}

          {has("medications") && (
            <Block
              icon={<PillIcon size={17} />}
              title={SHARE_SCOPE_LABELS.medications}
              onAdd={addButton("medications")}
              addLabel="Add medicine"
            >
              {record.medications.length === 0
                ? <Empty>No medicines recorded.</Empty>
                : [...record.medications].sort((a, b) => Number(b.active) - Number(a.active)).map((m) => (
                  <Item key={m.id} title={m.name}
                    meta={[m.dosage, m.frequency, m.active ? null : "Stopped"].filter(Boolean).join(" · ")}
                    onEdit={editButton("medications", m)}
                    editLabel={`Edit medication: ${m.name}`} />
                ))}
            </Block>
          )}

          {has("conditions") && (
            <Block
              icon={<HeartPulseIcon size={17} />}
              title={SHARE_SCOPE_LABELS.conditions}
              onAdd={addButton("conditions")}
              addLabel="Add condition"
            >
              {record.conditions.length === 0
                ? <Empty>No conditions recorded.</Empty>
                : record.conditions.map((c) => (
                  <Item key={c.id} title={c.name}
                    meta={[
                      CONDITION_STATUS_LABELS[c.status] ?? c.status,
                      c.onsetDate ? `since ${formatDate(c.onsetDate)}` : null,
                    ].filter(Boolean).join(" · ")}
                    onEdit={editButton("conditions", c)}
                    editLabel={`Edit condition: ${c.name}`} />
                ))}
            </Block>
          )}

          {has("measurements") && (
            <Block
              icon={<VitalsIcon size={17} />}
              title={SHARE_SCOPE_LABELS.measurements}
              onAdd={addButton("measurements")}
              addLabel="Add reading"
            >
              {latestVitals.length === 0
                ? <Empty>No readings recorded.</Empty>
                : latestVitals.map((v) => (
                  <div key={v.id} className="flex items-start gap-2 py-1">
                    <div className="min-w-0 flex-1">
                      <Row label={`${vitalName(v)} · ${formatDate(v.measuredAt)}`} value={formatVitalValue(v)} />
                    </div>
                    {editButton("measurements", v) && (
                      <button
                        type="button"
                        onClick={editButton("measurements", v)}
                        aria-label={`Edit reading: ${vitalName(v)}`}
                        className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full text-mhl-muted transition-colors hover:bg-mhl-sunk hover:text-mhl-ink"
                      >
                        <EditIcon size={16} />
                      </button>
                    )}
                  </div>
                ))}
            </Block>
          )}

          {has("appointments") && (
            <Block
              icon={<CalendarIcon size={17} />}
              title={SHARE_SCOPE_LABELS.appointments}
              onAdd={addButton("appointments")}
              addLabel="Add visit"
            >
              {upcoming.length === 0
                ? <Empty>No scheduled appointments.</Empty>
                : upcoming.map((a) => (
                  <Item key={a.id} title={a.title}
                    meta={[formatDate(a.scheduledFor), formatTime(a.scheduledFor), a.facility].filter(Boolean).join(" · ")}
                    onEdit={editButton("appointments", a)}
                    editLabel={`Edit appointment: ${a.title}`} />
                ))}
            </Block>
          )}

          {has("documents") && (
            <Block icon={<DocumentIcon size={17} />} title={SHARE_SCOPE_LABELS.documents}>
              {recentDocs.length === 0
                ? <Empty>No documents on file.</Empty>
                : recentDocs.map((d) => (
                  <Item key={d.id} title={d.title}
                    meta={[d.documentDate ? formatDate(d.documentDate) : formatRelative(d.uploadedAt), d.labName ?? d.provider].filter(Boolean).join(" · ")} />
                ))}
              {canEdit && (
                <p className="mt-2 text-mhl-fine text-mhl-faint">
                  Documents stay as the owner filed them. Add a clinical note below to contribute to this part of the record.
                </p>
              )}
            </Block>
          )}

          {has("immunizations") && (
            <Block icon={<VaccineIcon size={17} />} title={SHARE_SCOPE_LABELS.immunizations}>
              {record.immunizations.length === 0
                ? <Empty>No immunisations on file.</Empty>
                : record.immunizations.map((im) => (
                  <Item key={im.id} title={im.vaccine}
                    meta={[formatDate(im.administeredOn), im.doseNumber ? `dose ${im.doseNumber}` : null].filter(Boolean).join(" · ")} />
                ))}
            </Block>
          )}

          {canEdit && has("documents") && (
            <div className="border-t border-mhl-rule px-5 py-4">
              <p className="text-mhl-fine font-semibold text-mhl-ink">Add a clinical note</p>
              <p className="mt-0.5 text-mhl-fine text-mhl-muted">
                This note will be filed as a document on the record under your name.
              </p>
              {noteSaved ? (
                <div className="mt-3 flex items-center gap-2 text-mhl-fine font-semibold text-mhl-good">
                  <CheckIcon size={18} strokeWidth={2.25} />
                  Note saved to the record.
                </div>
              ) : (
                <form onSubmit={submitNote} className="mt-3 space-y-2">
                  <TextArea
                    label="" rows={3}
                    placeholder="Examination findings, instructions, lab order…"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                  {noteError && <p role="alert" className="text-mhl-fine text-mhl-danger">{noteError}</p>}
                  <Button type="submit" variant="secondary" size="md" loading={noteSaving} disabled={noteSaving || !noteText.trim()}>
                    Add note
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-mhl-fine text-mhl-faint">
          This window shows only what the record owner chose to share. For anything else, ask them directly.
        </p>
      </div>

      {editing && editingKind && (
        <RecordEditModal
          open
          title={`${editing.id ? "Edit" : "Add"} ${editingKind.label.toLowerCase()}`}
          draft={editing.draft}
          errors={errors}
          Fields={editingKind.Fields}
          onChange={(patch) =>
            setEditing((prev) =>
              prev ? { ...prev, draft: { ...(prev.draft as object), ...(patch as object) } } : prev,
            )
          }
          onSave={saveEditor}
          onClose={() => { setEditing(null); setErrors({}); setSaveError(null); }}
          saveLabel={saving ? "Saving…" : "Save to record"}
          error={saveError}
        />
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
