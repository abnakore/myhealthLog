/**
 * Care providers — real API-backed version.
 * Creates/revokes/deletes providers through SharingContext.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useSharing } from "@/store/SharingContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { formatDate, formatRelative } from "@/lib/format";
import { providerAccessUrl } from "@/lib/providerAccess";
import {
  PROVIDER_ACCESS,
  SHARE_STATUS_LABELS,
  newPin,
  providerAccessLabel,
  summariseScopes,
  type CareProvider,
  type ProviderAccess,
  type ShareScope,
  type ShareStatus,
} from "@/types/sharing";
import { apiErrorMessage } from "@/services/api";
import type { CreateProviderParams } from "@/services/sharing";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { SelectField, TextField } from "@/components/ui/fields";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { OwnerOnlyNotice } from "@/components/proxy/OwnerOnlyNotice";
import { ScopeChecklist } from "@/components/sharing/ScopeChecklist";
import { ShareCodePanel } from "@/components/sharing/ShareCodePanel";
import { CopyButton } from "@/components/sharing/CopyButton";
import { KeyIcon, PlusIcon, StethoscopeIcon, TrashIcon } from "@/components/icons";

const STATUS_TAG: Record<ShareStatus, { tone: TagTone; label: string }> = {
  PENDING: { tone: "watch", label: SHARE_STATUS_LABELS.PENDING },
  ACTIVE: { tone: "ok", label: SHARE_STATUS_LABELS.ACTIVE },
  EXPIRED: { tone: "neutral", label: SHARE_STATUS_LABELS.EXPIRED },
  REVOKED: { tone: "severe", label: SHARE_STATUS_LABELS.REVOKED },
};

function displayStatus(provider: CareProvider): ShareStatus {
  const { status, expiresAt } = provider;
  if ((status === "PENDING" || status === "ACTIVE") && expiresAt && new Date(expiresAt).getTime() < Date.now()) return "EXPIRED";
  return status;
}

interface GrantDraft {
  name: string;
  role: string;
  facility: string;
  access: ProviderAccess;
  scopes: ShareScope[];
  expiryDays: string;
  /** Every care-provider window is PIN-gated; this is the PIN the owner hands
      over with the link. It is stored hashed and cannot be shown again. */
  pin: string;
}

function emptyGrant(): GrantDraft {
  return {
    name: "",
    role: "",
    facility: "",
    access: "VIEW",
    scopes: [],
    expiryDays: "",
    pin: newPin(),
  };
}

function AccessPicker({ value, onChange }: { value: ProviderAccess; onChange: (next: ProviderAccess) => void }) {
  return (
    <div role="radiogroup" aria-label="What the provider can do" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {PROVIDER_ACCESS.map((opt) => {
        const on = opt.value === value;
        return (
          <button key={opt.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(opt.value)}
            className={cn("flex flex-col gap-0.5 rounded-mhl-sm border px-3 py-2.5 text-left transition-colors",
              on ? "border-mhl-accent bg-mhl-accent-lo" : "border-mhl-rule hover:bg-mhl-sunk")}>
            <span className={cn("text-mhl-body text-mhl-ink", on && "font-semibold")}>{opt.label}</span>
            <span className="text-mhl-fine text-mhl-muted">{opt.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

// The code panel needs the raw share code + a link. We store these after creation.
interface CodeReveal { provider: CareProvider; shareCode: string; pin?: string }

export default function CareProviders() {
  const { providers, addProvider, resetProviderPin, removeProviderPin, revokeProvider } = useSharing();
  const { isProxyView, activeOwnerName } = useCareProxy();

  const [grantOpen, setGrantOpen] = useState(false);
  const [draft, setDraft] = useState<GrantDraft>(emptyGrant);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [codeReveal, setCodeReveal] = useState<CodeReveal | null>(null);
  const [pinReset, setPinReset] = useState<CareProvider | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinErrors, setPinErrors] = useState<Record<string, string>>({});
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSaveError, setPinSaveError] = useState<string | null>(null);
  const [pinReveal, setPinReveal] = useState<{ provider: CareProvider; pin: string } | null>(null);
  const [revoke, setRevoke] = useState<CareProvider | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  if (isProxyView) {
    return (
      <div className="space-y-5">
        <PageHeader title="Care providers" subtitle="Give a doctor or lab a code to read — or fill in — part of your record." />
        <OwnerOnlyNotice
          title={`Only ${activeOwnerName} can share this record`}
          description="You're viewing this record as a care proxy. Codes for doctors and labs belong to the record owner."
        />
      </div>
    );
  }

  function openGrant() {
    setDraft(emptyGrant());
    setErrors({});
    setSaveError(null);
    setGrantOpen(true);
  }

  async function saveGrant() {
    const errs: Record<string, string> = {};
    if (!draft.name.trim()) errs.name = "Enter a name — who is this access for?";
    if (draft.scopes.length === 0) errs.scopes = "Pick at least one part of the record.";
    if (!/^\d{4,8}$/.test(draft.pin.trim())) {
      errs.pin = "Use a PIN of 4 to 8 digits.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      const params: CreateProviderParams = {
        name: draft.name.trim(),
        role: draft.role.trim() || undefined,
        facility: draft.facility.trim() || undefined,
        scopes: draft.scopes,
        access: draft.access,
        pin: draft.pin.trim(),
        expiresAt: draft.expiryDays
          ? new Date(Date.now() + Number(draft.expiryDays) * 86_400_000).toISOString()
          : undefined,
      };
      const result = await addProvider(params);
      setGrantOpen(false);
      setCodeReveal({
        provider: result.provider,
        shareCode: result.shareCode,
        // The PIN is hashed on the server, so the one the owner just set is
        // the only copy that can be shown — keep it for the hand-over panel.
        pin: draft.pin.trim(),
      });
    } catch (err) {
      setSaveError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openPinReset(provider: CareProvider) {
    setPinDraft(newPin());
    setPinErrors({});
    setPinSaveError(null);
    setPinReset(provider);
  }

  async function savePin() {
    if (!pinReset) return;
    if (!/^\d{4,8}$/.test(pinDraft.trim())) {
      setPinErrors({ pin: "Use a PIN of 4 to 8 digits." });
      return;
    }
    setPinSaving(true);
    setPinSaveError(null);
    try {
      await resetProviderPin(pinReset.id, pinDraft.trim());
      setPinReveal({ provider: pinReset, pin: pinDraft.trim() });
      setPinReset(null);
    } catch (err) {
      setPinSaveError(apiErrorMessage(err));
    } finally {
      setPinSaving(false);
    }
  }

  async function clearPin() {
    if (!pinReset) return;
    setPinSaving(true);
    setPinSaveError(null);
    try {
      await removeProviderPin(pinReset.id);
      setPinReset(null);
    } catch (err) {
      setPinSaveError(apiErrorMessage(err));
    } finally {
      setPinSaving(false);
    }
  }

  async function confirmRevoke() {
    if (!revoke) return;
    setRevokeError(null);
    try {
      await revokeProvider(revoke.id);
      setRevoke(null);
    } catch (err) {
      setRevokeError(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Care providers"
        subtitle="Give a doctor or lab a code to read — or fill in — part of your record."
        action={<Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openGrant}>Grant access</Button>}
      />

      <Section question="Who can see your record?" lead="Each code opens only the parts you chose. Revoke any time.">
        {providers.filter((p) => displayStatus(p) !== "REVOKED").length > 0 ? (
          <ul className="mt-4 divide-y divide-mhl-rule">
            {providers.map((p) => {
              const status = displayStatus(p);
              if (status === "REVOKED") return null;
              return (
                <li key={p.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
                    <StethoscopeIcon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-mhl-body font-semibold text-mhl-ink">{p.name}</p>
                      <Tag tone={STATUS_TAG[status].tone}>{STATUS_TAG[status].label}</Tag>
                    </div>
                    <p className="truncate text-mhl-fine text-mhl-muted">
                      {[p.role, p.facility].filter(Boolean).join(" · ") || "No role or facility on file"}
                    </p>
                    <p className="truncate text-mhl-fine text-mhl-faint">
                      {providerAccessLabel(p.access)} · {summariseScopes(p.scopes)}
                      {p.pinEnabled ? " · PIN protected" : " · No PIN set"}
                    </p>
                    <p className="truncate text-mhl-fine text-mhl-faint">
                      {p.lastAccessedAt ? `Last opened ${formatRelative(p.lastAccessedAt)}` : "Not opened yet"}
                      {" · "}
                      {p.expiresAt ? `Expires ${formatDate(p.expiresAt)}` : "Open until you revoke it"}
                    </p>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    {/* The code cannot be re-shown, but its PIN can be set, changed
                        or removed at any time. */}
                    <Button
                      variant="secondary"
                      icon={<KeyIcon size={16} />}
                      onClick={() => openPinReset(p)}
                      aria-label={`${p.pinEnabled ? "Change" : "Set"} the PIN for ${p.name}`}
                    >
                      {p.pinEnabled ? "Change PIN" : "Set PIN"}
                    </Button>
                    <IconButton label={`Revoke access for ${p.name}`} tone="danger" onClick={() => { setRevoke(p); setRevokeError(null); }}>
                      <TrashIcon size={18} />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            className="mt-4"
            icon={<StethoscopeIcon size={26} />}
            title="No one has access yet"
            description="Grant a code after a visit — your doctor or lab sees exactly what you choose, nothing more."
            action={<Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openGrant}>Grant access</Button>}
          />
        )}
      </Section>

      {/* Grant creation modal */}
      <Modal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        title="Grant access"
        description="Choose who it's for and exactly what opens."
        footer={
          <>
            <Button variant="secondary" onClick={() => setGrantOpen(false)}>Cancel</Button>
            <Button onClick={saveGrant} loading={saving} disabled={saving}>Create code</Button>
          </>
        }
      >
        <div className="space-y-4">
          {saveError && (
            <p role="alert" className="rounded-mhl-sm bg-mhl-danger-lo px-3 py-2 text-mhl-fine font-medium text-mhl-danger">{saveError}</p>
          )}
          <TextField label="Name" placeholder="Dr. F. Abdullahi" value={draft.name} error={errors.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <div>
            <TextField
              label="PIN for this window"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={draft.pin}
              error={errors.pin}
              hint="The care provider needs this PIN, with the link, to open the window."
              onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, "") })}
            />
            <button
              type="button"
              onClick={() => setDraft({ ...draft, pin: newPin() })}
              className="mt-1.5 text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
            >
              Generate a different PIN
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Role" optional placeholder="Endocrinologist" value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            <TextField label="Facility" optional placeholder="City Hospital" value={draft.facility}
              onChange={(e) => setDraft({ ...draft, facility: e.target.value })} />
          </div>
          <div>
            <p className="mb-1.5 text-mhl-fine font-semibold text-mhl-ink">What can they do?</p>
            <AccessPicker value={draft.access} onChange={(access) => setDraft({ ...draft, access })} />
          </div>
          <div>
            <p className="mb-1.5 text-mhl-fine font-semibold text-mhl-ink">What can they see?</p>
            <ScopeChecklist value={draft.scopes} onChange={(scopes) => setDraft({ ...draft, scopes })} error={errors.scopes} />
          </div>
          <SelectField label="Access ends" hint="You can revoke sooner at any time."
            value={draft.expiryDays} onChange={(e) => setDraft({ ...draft, expiryDays: e.target.value })}>
            <option value="">When you revoke it</option>
            <option value="14">In 2 weeks</option>
            <option value="30">In a month</option>
          </SelectField>
        </div>
      </Modal>

      {/* Reset PIN modal */}
      <Modal
        open={pinReset !== null}
        onClose={() => setPinReset(null)}
        title={pinReset?.pinEnabled ? "Change PIN" : "Set a PIN"}
        description={
          pinReset
            ? pinReset.pinEnabled
              ? `Choose a new PIN for ${pinReset.name}'s code.`
              : `${pinReset.name}'s code opens without a PIN. Add one so the code alone isn't enough.`
            : undefined
        }
        footer={
          <>
            {pinReset?.pinEnabled && (
              <Button variant="ghost" onClick={clearPin} disabled={pinSaving} className="mr-auto">
                Remove PIN
              </Button>
            )}
            <Button variant="secondary" onClick={() => setPinReset(null)}>Cancel</Button>
            <Button onClick={savePin} loading={pinSaving} disabled={pinSaving}>Save PIN</Button>
          </>
        }
      >
        <div className="space-y-3">
          {pinSaveError && (
            <p role="alert" className="rounded-mhl-sm bg-mhl-danger-lo px-3 py-2 text-mhl-fine font-medium text-mhl-danger">{pinSaveError}</p>
          )}
          <TextField
            label="New PIN"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pinDraft}
            error={pinErrors.pin}
            hint="The provider needs this PIN with the existing link to open the window."
            onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ""))}
          />
          <button
            type="button"
            onClick={() => setPinDraft(newPin())}
            className="text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
          >
            Generate a different PIN
          </button>
          <p className="text-mhl-fine text-mhl-muted">
            The link and share code stay the same. {pinReset?.pinEnabled ? "The old PIN stops working immediately, " : ""}
            and a code locked by wrong guesses is unlocked.
          </p>
        </div>
      </Modal>

      {/* Reset PIN reveal modal */}
      <Modal
        open={pinReveal !== null}
        onClose={() => setPinReveal(null)}
        title="PIN updated"
        description={pinReveal ? `Send this new PIN to ${pinReveal.provider.name} using the existing link.` : undefined}
        footer={<Button onClick={() => setPinReveal(null)}>Done</Button>}
      >
        {pinReveal && (
          <div className="rounded-mhl-sm bg-mhl-sunk p-4">
            <p className="text-mhl-fine text-mhl-muted">New PIN</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="select-all text-mhl-title font-bold tracking-[0.12em] text-mhl-ink">{pinReveal.pin}</span>
              <CopyButton value={pinReveal.pin} label="Copy PIN" />
            </div>
            <p className="mt-3 text-mhl-fine text-mhl-muted">
              This is the only time the PIN is shown. The provider's link and what it can open are unchanged.
            </p>
          </div>
        )}
      </Modal>

      {/* Code reveal modal */}
      <Modal
        open={codeReveal !== null}
        onClose={() => setCodeReveal(null)}
        title="Share this code"
        description={codeReveal ? `Give this to ${codeReveal.provider.name} — it opens only what you chose.` : undefined}
        footer={<Button onClick={() => setCodeReveal(null)}>Done</Button>}
      >
        {codeReveal && (
          <ShareCodePanel
            code={codeReveal.shareCode}
            link={providerAccessUrl(codeReveal.shareCode)}
            pin={codeReveal.pin}
            expiresAt={codeReveal.provider.expiresAt}
            access={codeReveal.provider.access}
            scopes={codeReveal.provider.scopes}
          />
        )}
      </Modal>

      {revokeError && (
        <p role="alert" className="rounded-mhl-sm bg-mhl-danger-lo px-3.5 py-3 text-mhl-fine font-medium text-mhl-danger">{revokeError}</p>
      )}

      <ConfirmDialog
        open={revoke !== null}
        title="Revoke access?"
        message={revoke ? `${revoke.name} will no longer be able to open the parts of your record you shared.` : ""}
        confirmLabel="Revoke"
        danger
        onConfirm={confirmRevoke}
        onClose={() => { setRevoke(null); setRevokeError(null); }}
      />
    </div>
  );
}
