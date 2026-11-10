/**
 * Care proxy — real API-backed version.
 * All grant operations go through CareProxyContext which calls the backend.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useCareProxy } from "@/store/CareProxyContext";
import { formatDate, formatRelative } from "@/lib/format";
import {
  PROXY_PERMISSIONS,
  PROXY_STATUS_LABELS,
  grantPersonName,
  proxyPermissionLabel,
  type CareProxyGrant,
  type ProxyPermission,
} from "@/types/proxy";
import { apiErrorMessage } from "@/services/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { TextArea, TextField } from "@/components/ui/fields";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import {
  CheckIcon, EditIcon, MailIcon, PlusIcon, RefreshIcon, ShieldIcon, TrashIcon, UsersIcon,
} from "@/components/icons";

function PermissionPicker({ value, onChange }: { value: ProxyPermission; onChange: (next: ProxyPermission) => void }) {
  return (
    <div role="radiogroup" aria-label="What they may do in your record" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {PROXY_PERMISSIONS.map((opt) => {
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

interface InviteDraft { email: string; permission: ProxyPermission; message: string }
function emptyInvite(): InviteDraft { return { email: "", permission: "VIEW", message: "" }; }

function identifierError(value: string): string | undefined {
  const v = value.trim();
  if (!v) return "Enter the email address or username they use.";
  if (v.includes("@")) return /^\S+@\S+\.\S+$/.test(v) ? undefined : "Check the address. It looks incomplete.";
  return /^[a-zA-Z0-9._-]{3,}$/.test(v) ? undefined : "A username needs at least three letters, numbers or dots.";
}

function ProxyRow({ grant, onEdit, onResend, onRemove }: {
  grant: CareProxyGrant; onEdit: () => void; onResend: () => void; onRemove: () => void;
}) {
  const active = grant.status === "ACTIVE";
  const who = grantPersonName(grant);
  return (
    <li className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-full",
        active ? "bg-mhl-accent-lo text-mhl-accent" : "bg-mhl-sunk text-mhl-muted")}>
        <UsersIcon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-mhl-body font-semibold text-mhl-ink">{who}</p>
          <Tag tone={active ? "ok" : "watch"}>{proxyPermissionLabel(grant.permission)}</Tag>
          {!active && <Tag tone="neutral">{PROXY_STATUS_LABELS[grant.status]}</Tag>}
        </div>
        <p className="truncate text-mhl-fine text-mhl-muted">
          {active
            ? `Access since ${formatDate(grant.acceptedAt ?? grant.invitedAt)}`
            : `Sent to ${grant.proxyEmail} · ${formatRelative(grant.invitedAt)}`}
        </p>
        {!active && grant.message && (
          <p className="mt-1 line-clamp-2 text-mhl-fine text-mhl-faint">"{grant.message}"</p>
        )}
      </div>
      <div className="flex flex-none items-center">
        {active ? (
          <>
            <IconButton label={`Change what ${who} can do`} onClick={onEdit}><EditIcon size={18} /></IconButton>
            <IconButton label={`Revoke access for ${who}`} tone="danger" onClick={onRemove}><TrashIcon size={18} /></IconButton>
          </>
        ) : (
          <>
            <IconButton label={`Resend invite to ${who}`} onClick={onResend}><RefreshIcon size={18} /></IconButton>
            <IconButton label={`Cancel invite to ${who}`} tone="danger" onClick={onRemove}><TrashIcon size={18} /></IconButton>
          </>
        )}
      </div>
    </li>
  );
}

export default function CareProxy() {
  const {
    invitedByMe, invitations, openable, isProxyView, activeOwnerName,
    switchTo, invite, acceptInvite, declineInvite, updatePermission, revoke, resendInvite,
  } = useCareProxy();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [draft, setDraft] = useState<InviteDraft>(emptyInvite);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sent, setSent] = useState<CareProxyGrant | null>(null);

  const [editing, setEditing] = useState<{ grant: CareProxyGrant; permission: ProxyPermission } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [removing, setRemoving] = useState<CareProxyGrant | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const granted = invitedByMe.filter((g) => g.status === "ACTIVE");
  const waiting = invitedByMe.filter((g) => g.status === "INVITED");

  function openInvite() {
    setDraft(emptyInvite());
    setErrors({});
    setInviteError(null);
    setInviteOpen(true);
  }

  async function sendInvite() {
    const problem = identifierError(draft.email);
    setErrors(problem ? { email: problem } : {});
    if (problem) return;
    setInviteSaving(true);
    setInviteError(null);
    try {
      const grant = await invite({ email: draft.email, permission: draft.permission, message: draft.message });
      setInviteOpen(false);
      setSent(grant);
    } catch (err) {
      setInviteError(apiErrorMessage(err));
    } finally {
      setInviteSaving(false);
    }
  }

  async function savePermission() {
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await updatePermission(editing.grant.id, editing.permission);
      setEditing(null);
    } catch (err) {
      setEditError(apiErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveError(null);
    try {
      await revoke(removing.id);
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Care proxy"
        subtitle="The people who can open your record, and whether they can change anything in it."
        action={!isProxyView ? (
          <Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openInvite}>Invite proxy</Button>
        ) : undefined}
      />

      {/* Incoming invitations */}
      {invitations.length > 0 && (
        <Section question="Invitations waiting for you" lead="Someone has asked you to look after their record.">
          <ul className="mt-3 space-y-2.5">
            {invitations.map((g) => (
              <li key={g.id} className="rounded-mhl-sm border border-mhl-rule bg-mhl-sunk p-3.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-mhl-body font-semibold text-mhl-ink">{g.ownerName}</p>
                  <Tag tone="watch">{proxyPermissionLabel(g.permission)}</Tag>
                </div>
                <p className="mt-1 text-mhl-fine text-mhl-muted">Invited you {formatRelative(g.invitedAt)}</p>
                {g.message && (
                  <p className="mt-2 border-l-2 border-mhl-rule pl-2.5 text-mhl-fine text-mhl-ink">"{g.message}"</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button icon={<CheckIcon size={18} strokeWidth={2.25} />} onClick={() => void acceptInvite(g.id)}>Accept</Button>
                  <Button variant="secondary" onClick={() => void declineInvite(g.id)}>Not now</Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Granted access section */}
      {isProxyView ? (
        <Section question={`Who can see ${activeOwnerName}'s record?`} lead="Sharing is the record owner's decision.">
          <p className="mt-3 rounded-mhl-sm bg-mhl-sunk px-3.5 py-3 text-mhl-fine text-mhl-muted">
            You're looking at this record as a care proxy, so you can read it but not pass it on.
          </p>
        </Section>
      ) : (
        <Section question="Who can see your record?" lead="Invite them by email; they only get in once they accept.">
          {invitedByMe.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={<UsersIcon size={26} />}
              title="No one else has access"
              description="Invite someone you trust, a partner, a parent, a grown-up child."
              action={<Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openInvite}>Invite proxy</Button>}
            />
          ) : (
            <ul className="mt-4 divide-y divide-mhl-rule">
              {[...granted, ...waiting].map((g) => (
                <ProxyRow
                  key={g.id} grant={g}
                  onEdit={() => setEditing({ grant: g, permission: g.permission })}
                  onResend={() => void resendInvite(g.id)}
                  onRemove={() => { setRemoving(g); setRemoveError(null); }}
                />
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* Records the signed-in user can step into */}
      {openable.length > 0 && (
        <Section question="Records you can open" lead={'Switch between them from \u201cYou\u2019re viewing\u201d.'}>
          <ul className="mt-2 divide-y divide-mhl-rule">
            {openable.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-3.5 first:pt-2">
                <Avatar name={g.ownerName} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-mhl-body font-semibold text-mhl-ink">{g.ownerName}</p>
                  <p className="text-mhl-fine text-mhl-muted">
                    {proxyPermissionLabel(g.permission)} · access since {formatDate(g.acceptedAt ?? g.invitedAt)}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => switchTo(g.ownerUserId)}>Open</Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Invite modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a proxy"
        description="They'll get an email with a link, and the invitation waits in their account too."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={sendInvite} loading={inviteSaving} disabled={inviteSaving}>Send invite</Button>
          </>
        }>
        <div className="space-y-4">
          {inviteError && (
            <p role="alert" className="rounded-mhl-sm bg-mhl-danger-lo px-3 py-2 text-mhl-fine font-medium text-mhl-danger">{inviteError}</p>
          )}
          <TextField label="Their email or username" placeholder="halima@example.com" inputMode="email" autoComplete="off"
            value={draft.email} error={errors.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <div>
            <p className="mb-1.5 text-mhl-fine font-semibold text-mhl-ink">What can they do?</p>
            <PermissionPicker value={draft.permission} onChange={(permission) => setDraft({ ...draft, permission })} />
          </div>
          <TextArea label="Message" optional rows={3} placeholder="Why you'd like them to have it."
            value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
        </div>
      </Modal>

      {/* Sent confirmation */}
      <Modal open={sent !== null} onClose={() => setSent(null)} title="Invite sent"
        description={sent ? `Your invitation is on its way to ${sent.proxyEmail}.` : undefined}
        footer={<Button onClick={() => setSent(null)}>Done</Button>}>
        {sent && (
          <ul className="space-y-3 text-mhl-body text-mhl-muted">
            <li className="flex gap-2.5">
              <span className="mt-0.5 flex-none text-mhl-accent"><MailIcon size={18} /></span>
              They get an email with a link, and the invitation waits in their myHealthLog account until they answer it.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-0.5 flex-none text-mhl-accent"><ShieldIcon size={18} /></span>
              Nothing of yours opens until they accept, and then they can{" "}
              {sent.permission === "FULL" ? "read your record and add to it on your behalf." : "read your record, and change nothing in it."}
            </li>
          </ul>
        )}
      </Modal>

      {/* Edit permission modal */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Change access"
        description={editing ? `What ${grantPersonName(editing.grant)} may do in your record.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={savePermission} loading={editSaving} disabled={editSaving}>Save changes</Button>
          </>
        }>
        {editing && (
          <div className="space-y-3">
            {editError && (
              <p role="alert" className="rounded-mhl-sm bg-mhl-danger-lo px-3 py-2 text-mhl-fine font-medium text-mhl-danger">{editError}</p>
            )}
            <PermissionPicker value={editing.permission}
              onChange={(permission) => setEditing((s) => (s ? { ...s, permission } : s))} />
            <p className="text-mhl-fine text-mhl-faint">This takes effect straight away.</p>
          </div>
        )}
      </Modal>

      {removeError && (
        <p role="alert" className="rounded-mhl-sm bg-mhl-danger-lo px-3.5 py-3 text-mhl-fine font-medium text-mhl-danger">{removeError}</p>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={removing?.status === "ACTIVE" ? "Revoke access?" : "Cancel this invite?"}
        message={removing
          ? removing.status === "ACTIVE"
            ? `${grantPersonName(removing)} won't be able to open your record again.`
            : `${grantPersonName(removing)} will stop seeing the invitation.`
          : ""}
        confirmLabel={removing?.status === "ACTIVE" ? "Revoke access" : "Cancel invite"}
        danger
        onConfirm={confirmRemove}
        onClose={() => { setRemoving(null); setRemoveError(null); }}
      />
    </div>
  );
}
