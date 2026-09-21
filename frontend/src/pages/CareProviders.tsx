/**
 * Care providers — the page behind "give my doctor limited access". Each grant is
 * a share code (with an optional PIN) that opens only the scopes you picked; the
 * provider enters that code at myHealthLog's unlock screen and can read — or, if
 * allowed, fill in — within that scope. Revoking deletes the code outright.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useSharing } from "@/store/SharingContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { genId } from "@/lib/id";
import { formatDate, formatRelative } from "@/lib/format";
import {
  PROVIDER_ACCESS,
  SHARE_STATUS_LABELS,
  newPin,
  newShareCode,
  providerAccessLabel,
  summariseScopes,
  type CareProvider,
  type ProviderAccess,
  type ShareScope,
  type ShareStatus,
} from "@/types/sharing";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { SelectField, TextField } from "@/components/ui/fields";
import { Switch } from "@/components/ui/Switch";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { OwnerOnlyNotice } from "@/components/proxy/OwnerOnlyNotice";
import { ScopeChecklist } from "@/components/sharing/ScopeChecklist";
import { ShareCodePanel } from "@/components/sharing/ShareCodePanel";
import { KeyIcon, PlusIcon, StethoscopeIcon, TrashIcon } from "@/components/icons";

const STATUS_TAG: Record<ShareStatus, { tone: TagTone; label: string }> = {
  PENDING: { tone: "watch", label: SHARE_STATUS_LABELS.PENDING },
  ACTIVE: { tone: "ok", label: SHARE_STATUS_LABELS.ACTIVE },
  EXPIRED: { tone: "neutral", label: SHARE_STATUS_LABELS.EXPIRED },
  REVOKED: { tone: "severe", label: SHARE_STATUS_LABELS.REVOKED },
};

/** A pending grant past its expiry date has, in effect, expired — show that
    honestly instead of leaving a dead code labelled "waiting to open". */
function displayStatus(provider: CareProvider): ShareStatus {
  const { status, expiresAt } = provider;
  if (
    (status === "PENDING" || status === "ACTIVE") &&
    expiresAt &&
    new Date(expiresAt).getTime() < Date.now()
  ) {
    return "EXPIRED";
  }
  return status;
}

interface GrantDraft {
  name: string;
  role: string;
  facility: string;
  access: ProviderAccess;
  scopes: ShareScope[];
  pinOn: boolean;
  /** "" = no expiry; otherwise days from now. */
  expiryDays: string;
}

function emptyGrant(): GrantDraft {
  return { name: "", role: "", facility: "", access: "VIEW", scopes: [], pinOn: false, expiryDays: "" };
}

/** The view-only / view-and-fill-in choice, as two plain cards. */
function AccessPicker({ value, onChange }: { value: ProviderAccess; onChange: (next: ProviderAccess) => void }) {
  return (
    <div role="radiogroup" aria-label="What the provider can do" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {PROVIDER_ACCESS.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex flex-col gap-0.5 rounded-mhl-sm border px-3 py-2.5 text-left transition-colors",
              on ? "border-mhl-accent bg-mhl-accent-lo" : "border-mhl-rule hover:bg-mhl-sunk",
            )}
          >
            <span className={cn("text-mhl-body text-mhl-ink", on && "font-semibold")}>{opt.label}</span>
            <span className="text-mhl-fine text-mhl-muted">{opt.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function CareProviders() {
  const { providers, addProvider, removeProvider } = useSharing();
  const { isProxyView, activeOwnerName } = useCareProxy();
  const [grantOpen, setGrantOpen] = useState(false);
  const [draft, setDraft] = useState<GrantDraft>(emptyGrant);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [codeFor, setCodeFor] = useState<CareProvider | null>(null);
  const [revoke, setRevoke] = useState<CareProvider | null>(null);

  // Share codes are the record owner's to create and to revoke — a proxy reading
  // someone else's record has no business minting one for it.
  if (isProxyView) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Care providers"
          subtitle="Give a doctor or lab a code to read — or fill in — part of your record."
        />
        <OwnerOnlyNotice
          title={`Only ${activeOwnerName} can share this record`}
          description="You're viewing this record as a care proxy. Codes for doctors and labs belong to the record owner — they create them, and they revoke them."
        />
      </div>
    );
  }

  function openGrant() {
    setDraft(emptyGrant());
    setErrors({});
    setGrantOpen(true);
  }

  function saveGrant() {
    const errs: Record<string, string> = {};
    if (!draft.name.trim()) errs.name = "Enter a name — who is this access for?";
    if (draft.scopes.length === 0) errs.scopes = "Pick at least one part of the record.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const provider: CareProvider = {
      id: genId("prov"),
      name: draft.name.trim(),
      role: draft.role.trim() || undefined,
      facility: draft.facility.trim() || undefined,
      scopes: draft.scopes,
      access: draft.access,
      shareCode: newShareCode(),
      pin: draft.pinOn ? newPin() : undefined,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      expiresAt: draft.expiryDays
        ? new Date(Date.now() + Number(draft.expiryDays) * 86_400_000).toISOString()
        : undefined,
    };
    addProvider(provider);
    setGrantOpen(false);
    // The very next thing you need is the code itself — hand it straight over.
    setCodeFor(provider);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Care providers"
        subtitle="Give a doctor or lab a code to read — or fill in — part of your record."
        action={
          <Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openGrant}>
            Grant access
          </Button>
        }
      />

      <Section
        question="Who can see your record?"
        lead="Each code opens only the parts you chose. Revoke any time — it stops working immediately."
      >
        {providers.length > 0 ? (
          <ul className="mt-4 divide-y divide-mhl-rule">
            {providers.map((p) => {
              const status = displayStatus(p);
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
                      {p.pin ? " · PIN protected" : ""}
                    </p>
                    <p className="truncate text-mhl-fine text-mhl-faint">
                      {p.lastAccessedAt ? `Last opened ${formatRelative(p.lastAccessedAt)}` : "Not opened yet"}
                      {" · "}
                      {p.expiresAt ? `Expires ${formatDate(p.expiresAt)}` : "Open until you revoke it"}
                    </p>
                  </div>
                  <div className="flex flex-none items-center">
                    <IconButton label={`Show code for ${p.name}`} onClick={() => setCodeFor(p)}>
                      <KeyIcon size={18} />
                    </IconButton>
                    <IconButton label={`Revoke access for ${p.name}`} tone="danger" onClick={() => setRevoke(p)}>
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
            action={
              <Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openGrant}>
                Grant access
              </Button>
            }
          />
        )}
      </Section>

      {/* The grant form — a modal on purpose: you answer four short questions and a
          code appears, so the whole flow stays one task. */}
      <Modal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        title="Grant access"
        description="Choose who it's for and exactly what opens."
        footer={
          <>
            <Button variant="secondary" onClick={() => setGrantOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveGrant}>Create code</Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Name"
            placeholder="Dr. F. Abdullahi"
            value={draft.name}
            error={errors.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Role"
              optional
              placeholder="Endocrinologist"
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            />
            <TextField
              label="Facility"
              optional
              placeholder="Murtala Muhammad Specialist Hospital"
              value={draft.facility}
              onChange={(e) => setDraft({ ...draft, facility: e.target.value })}
            />
          </div>

          <div>
            <p className="mb-1.5 text-mhl-fine font-semibold text-mhl-ink">What can they do?</p>
            <AccessPicker value={draft.access} onChange={(access) => setDraft({ ...draft, access })} />
          </div>

          <div>
            <p className="mb-1.5 text-mhl-fine font-semibold text-mhl-ink">What can they see?</p>
            <ScopeChecklist
              value={draft.scopes}
              onChange={(scopes) => setDraft({ ...draft, scopes })}
              error={errors.scopes}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-mhl-sm border border-mhl-rule px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-mhl-body font-semibold text-mhl-ink">Require a PIN?</p>
              <p className="mt-0.5 text-mhl-fine text-mhl-muted">
                A 4-digit PIN you send separately from the code.
              </p>
            </div>
            <Switch
              checked={draft.pinOn}
              onChange={(pinOn) => setDraft({ ...draft, pinOn })}
              label="Require a PIN"
            />
          </div>

          <SelectField
            label="Access ends"
            hint="You can revoke sooner at any time."
            value={draft.expiryDays}
            onChange={(e) => setDraft({ ...draft, expiryDays: e.target.value })}
          >
            <option value="">When you revoke it</option>
            <option value="14">In 2 weeks</option>
            <option value="30">In a month</option>
          </SelectField>
        </div>
      </Modal>

      {/* The code itself — shown right after creating, and again via the key icon. */}
      <Modal
        open={codeFor !== null}
        onClose={() => setCodeFor(null)}
        title="Share this code"
        description={codeFor ? `Give this to ${codeFor.name} — it opens only what you chose.` : undefined}
        footer={<Button onClick={() => setCodeFor(null)}>Done</Button>}
      >
        {codeFor && (
          <ShareCodePanel
            code={codeFor.shareCode}
            pin={codeFor.pin}
            expiresAt={codeFor.expiresAt}
            access={codeFor.access}
            scopes={codeFor.scopes}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={revoke !== null}
        title="Revoke access?"
        message={
          revoke
            ? `${revoke.name} will no longer be able to open the parts of your record you shared. This can't be undone.`
            : ""
        }
        confirmLabel="Revoke"
        danger
        onConfirm={() => {
          if (revoke) removeProvider(revoke.id);
        }}
        onClose={() => setRevoke(null)}
      />
    </div>
  );
}

