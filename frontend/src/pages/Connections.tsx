/**
 * Connected apps & devices — the mocked integration hub. Samsung Health, Google
 * Fit, BP monitors and the like feed readings in on their own instead of being
 * typed. Connecting is a staged mock (a short "handshake" delay, then the link
 * exists); the shape is what the backend's connection table will store.
 */
import { useState } from "react";
import { useSharing } from "@/store/SharingContext";
import {
  CONNECTION_CATALOG,
  CONNECTION_KIND_LABELS,
  connectionSource,
  type ConnectionSource,
} from "@/types/sharing";
import { formatRelative, initials } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import { LinkIcon, RefreshIcon, TrashIcon } from "@/components/icons";

export default function Connections() {
  const { connections, isConnected, connect, disconnect, syncConnection } = useSharing();
  const [connecting, setConnecting] = useState<ConnectionSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [toRemove, setToRemove] = useState<{ id: string; name: string } | null>(null);

  const available = CONNECTION_CATALOG.filter((s) => !isConnected(s.id));

  /** The mock handshake: a short spin, then the link exists and syncs start. */
  function confirmConnect() {
    if (!connecting) return;
    const id = connecting.id;
    setBusy(true);
    window.setTimeout(() => {
      connect(id);
      setBusy(false);
      setConnecting(null);
    }, 900);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Connected apps & devices"
        subtitle="Pull readings in automatically instead of typing them."
      />

      <Section
        question="What's connected?"
        lead="New readings arrive on their own — sync on demand, or disconnect any time."
      >
        {connections.length > 0 ? (
          <ul className="mt-4 divide-y divide-mhl-rule">
            {connections.map((c) => {
              const source = connectionSource(c.sourceId);
              const name = source?.name ?? c.sourceId;
              return (
                <li key={c.sourceId} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-fine font-bold">
                    {initials(name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-mhl-body font-semibold text-mhl-ink">{name}</p>
                    <p className="truncate text-mhl-fine text-mhl-muted">
                      {source ? CONNECTION_KIND_LABELS[source.kind] : "Connected"} · Last sync{" "}
                      {formatRelative(c.lastSync)}
                    </p>
                  </div>
                  <div className="flex flex-none items-center">
                    <IconButton label={`Sync ${name} now`} onClick={() => syncConnection(c.sourceId)}>
                      <RefreshIcon size={18} />
                    </IconButton>
                    <IconButton
                      label={`Disconnect ${name}`}
                      tone="danger"
                      onClick={() => setToRemove({ id: c.sourceId, name })}
                    >
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
            icon={<LinkIcon size={26} />}
            title="Nothing connected yet"
            description="Connect an app or device and its readings arrive on their own — no typing."
          />
        )}
      </Section>

      {available.length > 0 && (
        <Section question="Add a connection" lead="Apps and devices that can feed your record.">
          <ul className="mt-4 divide-y divide-mhl-rule">
            {available.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-fine font-bold">
                  {initials(s.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-mhl-body font-semibold text-mhl-ink">{s.name}</p>
                    <Tag tone="info">{CONNECTION_KIND_LABELS[s.kind]}</Tag>
                  </div>
                  <p className="mt-0.5 text-mhl-fine text-mhl-muted">{s.blurb}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.brings.map((b) => (
                      <span
                        key={b}
                        className="rounded-full bg-mhl-sunk px-2.5 py-1 text-[0.75rem] font-medium text-mhl-muted"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-none self-center">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConnecting(s);
                      setBusy(false);
                    }}
                  >
                    Connect
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Modal
        open={connecting !== null}
        onClose={() => {
          setConnecting(null);
          setBusy(false);
        }}
        title={connecting ? `Connect ${connecting.name}` : ""}
        description={connecting?.blurb}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setConnecting(null);
                setBusy(false);
              }}
            >
              Cancel
            </Button>
            <Button loading={busy} onClick={confirmConnect}>
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </>
        }
      >
        {connecting && (
          <div>
            <p className="text-mhl-body text-mhl-muted">myHealthLog will pull in:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {connecting.brings.map((b) => (
                <span
                  key={b}
                  className="rounded-full bg-mhl-sunk px-2.5 py-1 text-[0.75rem] font-medium text-mhl-muted"
                >
                  {b}
                </span>
              ))}
            </div>
            <p className="mt-3 text-mhl-fine text-mhl-faint">
              This is a demo connection — nothing leaves your device. Disconnect any time.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toRemove !== null}
        title="Disconnect?"
        message={
          toRemove
            ? `${toRemove.name} will stop sending readings. Anything already in your record stays.`
            : ""
        }
        confirmLabel="Disconnect"
        danger
        onConfirm={() => {
          if (toRemove) disconnect(toRemove.id);
        }}
        onClose={() => setToRemove(null)}
      />
    </div>
  );
}

