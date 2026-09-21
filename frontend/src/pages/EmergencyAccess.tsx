/**
 * Emergency access — the control room for the emergency card. You set the code a
 * responder types in (or scans), decide whether a PIN gates it, and tick exactly
 * which details it reveals. The card at the top is live: every toggle changes what
 * a stranger would see, so there's no guessing.
 */
import { useState } from "react";
import { useSharing } from "@/store/SharingContext";
import { useCareProxy } from "@/store/CareProxyContext";
import {
  EMERGENCY_TOGGLES,
  newEmergencyToken,
  newPin,
  type EmergencySettings,
  type EmergencyToggleKey,
} from "@/types/sharing";
import { formatRelative } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { TextArea } from "@/components/ui/fields";
import { EmergencyCard } from "@/components/emergency/EmergencyCard";
import { QrPlaceholder } from "@/components/emergency/QrPlaceholder";
import { CopyButton } from "@/components/sharing/CopyButton";
import { OwnerOnlyNotice } from "@/components/proxy/OwnerOnlyNotice";
import { RefreshIcon } from "@/components/icons";

export default function EmergencyAccess() {
  const { emergency, updateEmergency } = useSharing();
  const { isProxyView, activeOwnerName } = useCareProxy();
  const [regenOpen, setRegenOpen] = useState(false);

  // The emergency card carries its own code, PIN and toggles per person — and those
  // belong to whoever the card is for. A proxy reading a record doesn't get to rewrite
  // the code the owner has printed on a bracelet.
  if (isProxyView) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Emergency access"
          subtitle="Your card, your code, and exactly what it shows a responder."
        />
        <OwnerOnlyNotice
          title={`Only ${activeOwnerName} can change their emergency card`}
          description="You're viewing this record as a care proxy. The card, its code and what it reveals are the record owner's own settings — they can hand you the printed card, but the code is theirs to manage."
        />
      </div>
    );
  }

  function setToggle(key: EmergencyToggleKey, value: boolean) {
    const patch: Partial<EmergencySettings> = {};
    patch[key] = value;
    updateEmergency(patch);
  }

  function togglePin(on: boolean) {
    if (on) updateEmergency({ pinEnabled: true, pin: emergency.pin ?? newPin() });
    else updateEmergency({ pinEnabled: false });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Emergency access"
        subtitle="Your card, your code, and exactly what it shows a responder."
      />

      <Section
        question="What does a responder see?"
        lead="The exact card a stranger opens with your code — nothing more."
      >
        <EmergencyCard hideManageLink className="mt-4" />
      </Section>

      <Section
        question="Who can open your card?"
        lead="No app, no login — a responder enters this code at myHealthLog's emergency screen."
      >
        <div className="mt-4 flex flex-col items-center gap-4 rounded-mhl-sm bg-mhl-sunk p-4 sm:flex-row sm:items-start">
          <div className="flex-none rounded-mhl-sm bg-white p-2.5 shadow-sm">
            <QrPlaceholder token={emergency.token} size={96} className="block text-mhl-ink" />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-mhl-fine text-mhl-muted">Emergency code</p>
            <div className="mt-1 flex items-center justify-center gap-3 sm:justify-start">
              <span className="select-all text-mhl-body font-bold tracking-[0.1em] text-mhl-ink">
                {emergency.token}
              </span>
              <CopyButton value={emergency.token} />
            </div>
            <div className="mt-2.5">
              <Button
                variant="secondary"
                icon={<RefreshIcon size={16} />}
                onClick={() => setRegenOpen(true)}
              >
                Regenerate
              </Button>
            </div>
            <p className="mt-2 text-mhl-fine text-mhl-faint">
              A new code invalidates every card already printed with the old one.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4 border-t border-mhl-rule pt-4">
          <div className="min-w-0">
            <p className="text-mhl-body font-semibold text-mhl-ink">Require a PIN?</p>
            <p className="mt-0.5 text-mhl-fine text-mhl-muted">
              A responder enters it before the card opens. Pick one a stranger could read off a bracelet.
            </p>
          </div>
          <Switch checked={emergency.pinEnabled} onChange={togglePin} label="Require a PIN" />
        </div>

        {emergency.pinEnabled && emergency.pin && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-mhl-sm bg-mhl-sunk px-4 py-3">
            <span className="select-all text-mhl-lead font-bold tracking-[0.2em] text-mhl-ink">
              {emergency.pin}
            </span>
            <div className="flex flex-none items-center gap-3">
              <CopyButton value={emergency.pin} label="Copy PIN" />
              <button
                type="button"
                onClick={() => updateEmergency({ pin: newPin() })}
                className="text-mhl-fine font-semibold text-mhl-accent transition-colors hover:text-mhl-accent-strong"
              >
                New PIN
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section
        question="What should the card show?"
        lead="Tick exactly what a responder may see — the card above updates as you toggle."
      >
        <ul className="mt-2 divide-y divide-mhl-rule">
          {EMERGENCY_TOGGLES.map((t) => (
            <li key={t.key} className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-mhl-body font-semibold text-mhl-ink">{t.label}</p>
                <p className="mt-0.5 text-mhl-fine text-mhl-muted">{t.hint}</p>
              </div>
              <Switch checked={emergency[t.key]} onChange={(v) => setToggle(t.key, v)} label={t.label} />
            </li>
          ))}
        </ul>

        {emergency.showNote && (
          <div className="mt-1 border-t border-mhl-rule pt-4">
            <TextArea
              label="Personal note"
              rows={2}
              value={emergency.note}
              onChange={(e) => updateEmergency({ note: e.target.value })}
              hint="One or two lines a responder should read."
            />
          </div>
        )}

        <p className="mt-3 text-mhl-fine text-mhl-faint">Last updated {formatRelative(emergency.updatedAt)}</p>
      </Section>

      <ConfirmDialog
        open={regenOpen}
        title="Generate a new code?"
        message="The code on any card already printed or shared will stop working. Do this only if a code has leaked or you've lost track of it."
        confirmLabel="Generate new code"
        onConfirm={() => updateEmergency({ token: newEmergencyToken() })}
        onClose={() => setRegenOpen(false)}
      />
    </div>
  );
}

