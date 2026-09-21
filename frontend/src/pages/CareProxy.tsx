/**
 * Care proxy — who may open your record, and at what level.
 *
 * The owner's half: every person with access (name, permission, the date it was
 * granted), an invite for a new one, and the two controls that matter afterwards —
 * change the level, or revoke. The other half faces the proxy: invitations waiting
 * for them, and the records they can step into. Both live here because they are the
 * same question asked from either end of the relationship.
 *
 * An invite is a grant in the `INVITED` state: it exists, it is visible to the owner,
 * and nothing opens until the other person accepts. The switching itself isn't this
 * page's job — that's the "You're viewing" control in the app frame, which every page
 * then obeys.
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
  CheckIcon,
  EditIcon,
  MailIcon,
  PlusIcon,
  RefreshIcon,
  ShieldIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";

/** The two-level choice, as two plain cards — the same shape as the provider picker,
    because it answers the same kind of question: what may this person do? */
function PermissionPicker({
  value,
  onChange,
}: {
  value: ProxyPermission;
  onChange: (next: ProxyPermission) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="What they may do in your record"
      className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
    >
      {PROXY_PERMISSIONS.map((opt) => {
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

interface InviteDraft {
  email: string;
  permission: ProxyPermission;
  message: string;
}

function emptyInvite(): InviteDraft {
  return { email: "", permission: "VIEW", message: "" };
}

/** An email address, or the username they signed up with — the two things a backend
    could resolve to an account. Returns the problem to show, or undefined. */
function identifierError(value: string): string | undefined {
  const v = value.trim();
  if (!v) return "Enter the email address or username they use.";
  if (v.includes("@")) {
    return /^\S+@\S+\.\S+$/.test(v) ? undefined : "Check the address — it looks incomplete.";
  }
  return /^[a-zA-Z0-9._-]{3,}$/.test(v)
    ? undefined
    : "A username needs at least three letters, numbers or dots.";
}

/** One person in the list: who they are, what they may do, and since when — or, for a
    grant still waiting to be accepted, where the invite went and how long ago. The
    controls differ by state: an accepted grant can have its level changed or be
    revoked; a waiting one can be sent again or called off. */
function ProxyRow({
  grant,
  onEdit,
  onResend,
  onRemove,
}: {
  grant: CareProxyGrant;
  onEdit: () => void;
  onResend: () => void;
  onRemove: () => void;
}) {
  const active = grant.status === "ACTIVE";
  const who = grantPersonName(grant);

  return (
    <li className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <span
        className={cn(
          "grid h-10 w-10 flex-none place-items-center rounded-full",
          active ? "bg-mhl-accent-lo text-mhl-accent" : "bg-mhl-sunk text-mhl-muted",
        )}
      >
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
          <p className="mt-1 line-clamp-2 text-mhl-fine text-mhl-faint">“{grant.message}”</p>
        )}
      </div>
      <div className="flex flex-none items-center">
        {active ? (
          <>
            <IconButton label={`Change what ${who} can do`} onClick={onEdit}>
              <EditIcon size={18} />
            </IconButton>
            <IconButton label={`Revoke access for ${who}`} tone="danger" onClick={onRemove}>
              <TrashIcon size={18} />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton label={`Send the invite to ${who} again`} onClick={onResend}>
              <RefreshIcon size={18} />
            </IconButton>
            <IconButton label={`Cancel the invite to ${who}`} tone="danger" onClick={onRemove}>
              <TrashIcon size={18} />
            </IconButton>
          </>
        )}
      </div>
    </li>
  );
}

export default function CareProxy() {
  const {
    invitedByMe,
    invitations,
    openable,
    isProxyView,
    activeOwnerName,
    switchTo,
    invite,
    acceptInvite,
    declineInvite,
    updatePermission,
    revoke,
    resendInvite,
  } = useCareProxy();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [draft, setDraft] = useState<InviteDraft>(emptyInvite);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<CareProxyGrant | null>(null);
  const [editing, setEditing] = useState<{ grant: CareProxyGrant; permission: ProxyPermission } | null>(
    null,
  );
  const [removing, setRemoving] = useState<CareProxyGrant | null>(null);

  const granted = invitedByMe.filter((g) => g.status === "ACTIVE");
  const waiting = invitedByMe.filter((g) => g.status === "INVITED");

  function openInvite() {
    setDraft(emptyInvite());
    setErrors({});
    setInviteOpen(true);
  }

  function sendInvite() {
    const problem = identifierError(draft.email);
    setErrors(problem ? { email: problem } : {});
    if (problem) return;
    const grant = invite({ email: draft.email, permission: draft.permission, message: draft.message });
    setInviteOpen(false);
    // The invite's own details are the confirmation: what was sent, to whom, at what
    // level, and that nothing opens until they accept.
    setSent(grant);
  }

  function savePermission() {
    if (!editing) return;
    updatePermission(editing.grant.id, editing.permission);
    setEditing(null);
  }

  /** Revoke and cancel are the same change to the data — only the words differ. */
  function confirmRemove() {
    if (removing) revoke(removing.id);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Care proxy"
        subtitle="The people who can open your record, and whether they can change anything in it."
        action={
          !isProxyView ? (
            <Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openInvite}>
              Invite proxy
            </Button>
          ) : undefined
        }
      />

      {/* Invitations addressed to the signed-in user. Nothing is open yet — accepting
          is the moment a grant becomes access. */}
      {invitations.length > 0 && (
        <Section
          question="Invitations waiting for you"
          lead="Someone has asked you to look after their record. It stays shut until you accept."
        >
          <ul className="mt-3 space-y-2.5">
            {invitations.map((g) => (
              <li key={g.id} className="rounded-mhl-sm border border-mhl-rule bg-mhl-sunk p-3.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-mhl-body font-semibold text-mhl-ink">{g.ownerName}</p>
                  <Tag tone="watch">{proxyPermissionLabel(g.permission)}</Tag>
                </div>
                <p className="mt-1 text-mhl-fine text-mhl-muted">
                  Invited you {formatRelative(g.invitedAt)}
                </p>
                {g.message && (
                  <p className="mt-2 border-l-2 border-mhl-rule pl-2.5 text-mhl-fine text-mhl-ink">
                    “{g.message}”
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    icon={<CheckIcon size={18} strokeWidth={2.25} />}
                    onClick={() => acceptInvite(g.id)}
                  >
                    Accept
                  </Button>
                  <Button variant="secondary" onClick={() => declineInvite(g.id)}>
                    Not now
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Who has access to the record you're viewing. A proxy sees this section but
          can't act in it: handing someone else's record to a third person isn't a
          proxy's call to make. */}
      {isProxyView ? (
        <Section
          question={`Who can see ${activeOwnerName}'s record?`}
          lead="Sharing is the record owner's decision."
        >
          <p className="mt-3 rounded-mhl-sm bg-mhl-sunk px-3.5 py-3 text-mhl-fine text-mhl-muted">
            You're looking at this record as a care proxy, so you can read it but not pass it on.
            Only {activeOwnerName} can invite people, change what they may do, or take access away.
          </p>
        </Section>
      ) : (
        <Section
          question="Who can see your record?"
          lead="Family you trust, usually. Invite them by email; they only get in once they accept."
        >
          {invitedByMe.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={<UsersIcon size={26} />}
              title="No one else has access"
              description="Invite someone you trust — a partner, a parent, a grown-up child — so they can read your record, or help you keep it up to date."
              action={
                <Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openInvite}>
                  Invite proxy
                </Button>
              }
            />
          ) : (
            <ul className="mt-4 divide-y divide-mhl-rule">
              {[...granted, ...waiting].map((g) => (
                <ProxyRow
                  key={g.id}
                  grant={g}
                  onEdit={() => setEditing({ grant: g, permission: g.permission })}
                  onResend={() => resendInvite(g.id)}
                  onRemove={() => setRemoving(g)}
                />
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* The records this account can step into — the same set the switcher in the app
          frame offers, spelled out with what may be done in each. */}
      {openable.length > 0 && (
        <Section
          question="Records you can open"
          lead="Switch between them from “You're viewing” — or step straight in from here."
        >
          <ul className="mt-2 divide-y divide-mhl-rule">
            {openable.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-3.5 first:pt-2">
                <Avatar name={g.ownerName} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-mhl-body font-semibold text-mhl-ink">{g.ownerName}</p>
                  <p className="text-mhl-fine text-mhl-muted">
                    {proxyPermissionLabel(g.permission)} · access since{" "}
                    {formatDate(g.acceptedAt ?? g.invitedAt)}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => switchTo(g.ownerUserId)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* The invite itself: their email or username, the level, and an optional note.
          Three answers and it's sent, so the whole thing stays one task. */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a proxy"
        description="They'll get an email with a link — and the invitation waits in their account too."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendInvite}>Send invite</Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Their email or username"
            placeholder="halima@example.com"
            inputMode="email"
            autoComplete="off"
            value={draft.email}
            error={errors.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />

          <div>
            <p className="mb-1.5 text-mhl-fine font-semibold text-mhl-ink">What can they do?</p>
            <PermissionPicker
              value={draft.permission}
              onChange={(permission) => setDraft({ ...draft, permission })}
            />
          </div>

          <TextArea
            label="Message"
            optional
            rows={3}
            placeholder="Why you'd like them to have it — they'll read this with the invitation."
            value={draft.message}
            onChange={(e) => setDraft({ ...draft, message: e.target.value })}
          />
        </div>
      </Modal>

      {/* Confirmation of what was actually sent, and the one thing that matters next:
          nothing opens until they accept. */}
      <Modal
        open={sent !== null}
        onClose={() => setSent(null)}
        title="Invite sent"
        description={sent ? `Your invitation is on its way to ${sent.proxyEmail}.` : undefined}
        footer={<Button onClick={() => setSent(null)}>Done</Button>}
      >
        {sent && (
          <ul className="space-y-3 text-mhl-body text-mhl-muted">
            <li className="flex gap-2.5">
              <span className="mt-0.5 flex-none text-mhl-accent">
                <MailIcon size={18} />
              </span>
              They get an email with a link, and the invitation waits in their myHealthLog account until
              they answer it.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-0.5 flex-none text-mhl-accent">
                <ShieldIcon size={18} />
              </span>
              Nothing of yours opens until they accept — and then they can{" "}
              {sent.permission === "FULL"
                ? "read your record and add to it on your behalf."
                : "read your record, and change nothing in it."}
            </li>
          </ul>
        )}
      </Modal>

      {/* Changing the level of an accepted grant. Applies at once — the proxy's own
          session picks it up, with nothing to re-accept. */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Change access"
        description={
          editing ? `What ${grantPersonName(editing.grant)} may do in your record.` : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={savePermission}>Save changes</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <PermissionPicker
              value={editing.permission}
              onChange={(permission) => setEditing((s) => (s ? { ...s, permission } : s))}
            />
            <p className="text-mhl-fine text-mhl-faint">
              This takes effect straight away — nothing needs accepting again.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title={removing?.status === "ACTIVE" ? "Revoke access?" : "Cancel this invite?"}
        message={
          removing
            ? removing.status === "ACTIVE"
              ? `${grantPersonName(removing)} won't be able to open your record again. What they saw before isn't undone.`
              : `${grantPersonName(removing)} will stop seeing the invitation, and the link we sent stops working.`
            : ""
        }
        confirmLabel={removing?.status === "ACTIVE" ? "Revoke access" : "Cancel invite"}
        danger
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
