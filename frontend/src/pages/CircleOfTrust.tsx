/**
 * Circle of trust — the people (usually family) who may see the record and act on
 * the person's behalf. A proxy can be a quiet reader, a hands-on manager who logs
 * records for you, or both — and the emergency-access flag decides whether they
 * may open the emergency card when it counts.
 */
import { useState } from "react";
import { useSharing } from "@/store/SharingContext";
import { genId } from "@/lib/id";
import { formatDate } from "@/lib/format";
import { summariseScopes, type CareProxy, type ShareScope } from "@/types/sharing";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/fields";
import { Switch } from "@/components/ui/Switch";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import { ScopeChecklist } from "@/components/sharing/ScopeChecklist";
import { EditIcon, PlusIcon, TrashIcon, UsersIcon } from "@/components/icons";

interface ProxyDraft {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  scopes: ShareScope[];
  canManage: boolean;
  emergencyAccess: boolean;
}

function emptyProxy(): ProxyDraft {
  return { name: "", relationship: "", phone: "", email: "", scopes: [], canManage: false, emergencyAccess: false };
}

function proxyToDraft(p: CareProxy): ProxyDraft {
  return {
    name: p.name,
    relationship: p.relationship,
    phone: p.phone ?? "",
    email: p.email ?? "",
    scopes: [...p.scopes],
    canManage: p.canManage,
    emergencyAccess: p.emergencyAccess,
  };
}

export default function CircleOfTrust() {
  const { proxies, addProxy, updateProxy, removeProxy } = useSharing();
  const [editState, setEditState] = useState<{ id: string | null; draft: ProxyDraft } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toRemove, setToRemove] = useState<CareProxy | null>(null);

  function openAdd() {
    setEditState({ id: null, draft: emptyProxy() });
    setErrors({});
  }

  function save() {
    if (!editState) return;
    const d = editState.draft;
    const errs: Record<string, string> = {};
    if (!d.name.trim()) errs.name = "Enter their name.";
    if (!d.relationship.trim()) errs.relationship = "How are you related?";
    if (d.scopes.length === 0) errs.scopes = "Pick at least one part of the record.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const fields = {
      name: d.name.trim(),
      relationship: d.relationship.trim(),
      phone: d.phone.trim() || undefined,
      email: d.email.trim() || undefined,
      scopes: d.scopes,
      canManage: d.canManage,
      emergencyAccess: d.emergencyAccess,
    };
    if (editState.id) {
      updateProxy(editState.id, fields);
    } else {
      addProxy({ id: genId("proxy"), ...fields, createdAt: new Date().toISOString() });
    }
    setEditState(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Circle of trust"
        subtitle="The people allowed to see your record and act for you — family, mostly."
        action={
          <Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openAdd}>
            Add someone
          </Button>
        }
      />

      <Section
        question="Who's in your circle of trust?"
        lead="Each person sees only what you choose. You can change it or remove them any time."
      >
        {proxies.length > 0 ? (
          <ul className="mt-4 divide-y divide-mhl-rule">
            {proxies.map((p) => (
              <li key={p.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
                  <UsersIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-mhl-body font-semibold text-mhl-ink">{p.name}</p>
                    {p.canManage && <Tag tone="info">Manages records</Tag>}
                    {p.emergencyAccess && <Tag tone="watch">Emergency access</Tag>}
                  </div>
                  <p className="truncate text-mhl-fine text-mhl-muted">
                    {[p.relationship, p.phone, p.email].filter(Boolean).join(" · ")}
                  </p>
                  <p className="truncate text-mhl-fine text-mhl-faint">
                    {summariseScopes(p.scopes)} · Since {formatDate(p.createdAt)}
                  </p>
                </div>
                <div className="flex flex-none items-center">
                  <IconButton
                    label={`Edit ${p.name}`}
                    onClick={() => {
                      setEditState({ id: p.id, draft: proxyToDraft(p) });
                      setErrors({});
                    }}
                  >
                    <EditIcon size={18} />
                  </IconButton>
                  <IconButton label={`Remove ${p.name}`} tone="danger" onClick={() => setToRemove(p)}>
                    <TrashIcon size={18} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-4"
            icon={<UsersIcon size={26} />}
            title="Your circle is empty"
            description="Add the person who handles your health with you — a spouse, an adult child, a caregiver."
            action={
              <Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={openAdd}>
                Add someone
              </Button>
            }
          />
        )}
      </Section>

      <Modal
        open={editState !== null}
        onClose={() => setEditState(null)}
        title={editState?.id ? "Edit their access" : "Add to your circle"}
        description="What they can see — and how far their say goes."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditState(null)}>
              Cancel
            </Button>
            <Button onClick={save}>{editState?.id ? "Save changes" : "Add to circle"}</Button>
          </>
        }
      >
        {editState && (
          <div className="space-y-4">
            <TextField
              label="Name"
              placeholder="Ibrahim Yusuf"
              value={editState.draft.name}
              error={errors.name}
              onChange={(e) =>
                setEditState((s) => (s ? { ...s, draft: { ...s.draft, name: e.target.value } } : s))
              }
            />
            <TextField
              label="Relationship"
              placeholder="Husband"
              value={editState.draft.relationship}
              error={errors.relationship}
              onChange={(e) =>
                setEditState((s) => (s ? { ...s, draft: { ...s.draft, relationship: e.target.value } } : s))
              }
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Phone"
                optional
                placeholder="0803 555 7788"
                inputMode="tel"
                value={editState.draft.phone}
                onChange={(e) =>
                  setEditState((s) => (s ? { ...s, draft: { ...s.draft, phone: e.target.value } } : s))
                }
              />
              <TextField
                label="Email"
                optional
                placeholder="ibrahim@example.com"
                inputMode="email"
                value={editState.draft.email}
                onChange={(e) =>
                  setEditState((s) => (s ? { ...s, draft: { ...s.draft, email: e.target.value } } : s))
                }
              />
            </div>

            <div>
              <p className="mb-1.5 text-mhl-fine font-semibold text-mhl-ink">What can they see?</p>
              <ScopeChecklist
                value={editState.draft.scopes}
                onChange={(scopes) => setEditState((s) => (s ? { ...s, draft: { ...s.draft, scopes } } : s))}
                error={errors.scopes}
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-mhl-sm border border-mhl-rule px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-mhl-body font-semibold text-mhl-ink">Can add and edit records for you</p>
                <p className="mt-0.5 text-mhl-fine text-mhl-muted">
                  Not just viewing — they can log readings and appointments too.
                </p>
              </div>
              <Switch
                checked={editState.draft.canManage}
                onChange={(canManage) =>
                  setEditState((s) => (s ? { ...s, draft: { ...s.draft, canManage } } : s))
                }
                label="Can add and edit records"
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-mhl-sm border border-mhl-rule px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-mhl-body font-semibold text-mhl-ink">Can open your emergency card</p>
                <p className="mt-0.5 text-mhl-fine text-mhl-muted">
                  They can unlock the full card and speak for you when it counts.
                </p>
              </div>
              <Switch
                checked={editState.draft.emergencyAccess}
                onChange={(emergencyAccess) =>
                  setEditState((s) => (s ? { ...s, draft: { ...s.draft, emergencyAccess } } : s))
                }
                label="Can open the emergency card"
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toRemove !== null}
        title="Remove them from your circle?"
        message={
          toRemove
            ? `${toRemove.name} will no longer see your record or act for you. What they saw before isn't undone.`
            : ""
        }
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (toRemove) removeProxy(toRemove.id);
        }}
        onClose={() => setToRemove(null)}
      />
    </div>
  );
}

