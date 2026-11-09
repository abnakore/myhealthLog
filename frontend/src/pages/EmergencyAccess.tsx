/**
 * Emergency Access — real API-backed version.
 * Reads from SharingContext (which fetches from backend).
 * regenerate → calls API and updates the token.
 * All toggle changes → PATCH /sharing/emergency/.
 */
import { useState } from "react";
import { useSharing } from "@/store/SharingContext";
import { useCareProxy } from "@/store/CareProxyContext";
import {
  EMERGENCY_TOGGLES,
  type EmergencySettings,
  type EmergencyToggleKey,
} from "@/types/sharing";
import { emergencyUrl } from "@/lib/emergency";
import { formatRelative } from "@/lib/format";
import { apiErrorMessage } from "@/services/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Button, buttonStyles } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { TextArea } from "@/components/ui/fields";
import { EmergencyCard } from "@/components/emergency/EmergencyCard";
import { QrCode } from "@/components/emergency/QrCode";
import { qrSvgMarkup } from "@/lib/qrcode";
import { CopyButton } from "@/components/sharing/CopyButton";
import { OwnerOnlyNotice } from "@/components/proxy/OwnerOnlyNotice";
import { DownloadIcon, RefreshIcon } from "@/components/icons";

export default function EmergencyAccess() {
  const { emergency, updateEmergency, regenerateToken } = useSharing();
  const { isProxyView, activeOwnerName } = useCareProxy();
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const url = emergencyUrl(emergency.token);

  function handleDownloadCode() {
    const blob = new Blob([qrSvgMarkup(url)], { type: "image/svg+xml" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "myhealthlog-emergency-code.svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  if (isProxyView) {
    return (
      <div className="space-y-5">
        <PageHeader title="Emergency access" subtitle="Your card, your code, and exactly what it shows a responder." />
        <OwnerOnlyNotice
          title={`Only ${activeOwnerName} can change their emergency card`}
          description="You're viewing this record as a care proxy. The card, its code and what it reveals are the record owner's own settings."
        />
      </div>
    );
  }

  async function setToggle(key: EmergencyToggleKey, value: boolean) {
    setUpdateError(null);
    try {
      const patch: Partial<EmergencySettings> = {};
      patch[key] = value;
      await updateEmergency(patch);
    } catch (err) {
      setUpdateError(apiErrorMessage(err));
    }
  }

  async function togglePin(on: boolean) {
    setUpdateError(null);
    try {
      if (on) {
        // Generate a random 4-digit PIN
        const newPin = String(Math.floor(1000 + Math.random() * 9000));
        await updateEmergency({ pinEnabled: true, pin: newPin });
      } else {
        await updateEmergency({ pinEnabled: false });
      }
    } catch (err) {
      setUpdateError(apiErrorMessage(err));
    }
  }

  async function handleRegen() {
    setRegenLoading(true);
    setRegenError(null);
    try {
      await regenerateToken();
      setRegenOpen(false);
    } catch (err) {
      setRegenError(apiErrorMessage(err));
    } finally {
      setRegenLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Emergency access" subtitle="Your card, your code, and exactly what it shows a responder." />

      {updateError && (
        <p role="alert" className="rounded-mhl-sm bg-mhl-danger-lo px-3.5 py-3 text-mhl-fine font-medium text-mhl-danger">
          {updateError}
        </p>
      )}

      <Section question="Your emergency code" lead="Scan it or open the link — no app, no account, and nothing else to find.">
        <div className="mt-4 flex flex-col items-center gap-5 rounded-mhl-sm bg-mhl-sunk p-4 sm:flex-row sm:items-start">
          <div className="flex-none rounded-mhl-sm bg-white p-3 shadow-sm">
            {emergency.token ? (
              <QrCode value={url} size={188} className="block text-mhl-ink" label="Emergency QR code" />
            ) : (
              <div className="h-[188px] w-[188px] flex items-center justify-center bg-mhl-sunk rounded text-mhl-faint text-mhl-fine">Loading…</div>
            )}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-mhl-fine text-mhl-muted">The link the code opens</p>
            {emergency.token ? (
              <>
                <p className="mt-1 select-all break-all text-mhl-fine font-medium text-mhl-ink">{url}</p>
                <div className="mt-1.5"><CopyButton value={url} label="Copy link" /></div>
              </>
            ) : (
              <p className="mt-1 text-mhl-fine text-mhl-muted">Token loading…</p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              {emergency.token && (
                <a href={url} target="_blank" rel="noreferrer" className={buttonStyles("primary", "md")}>
                  Preview emergency view
                </a>
              )}
              <Button variant="secondary" icon={<RefreshIcon size={16} />} onClick={() => setRegenOpen(true)}>
                Regenerate
              </Button>
              {emergency.token && (
                <Button variant="secondary" icon={<DownloadIcon size={16} />} onClick={handleDownloadCode}>
                  Save code
                </Button>
              )}
            </div>
            <p className="mt-3 text-mhl-fine text-mhl-faint">
              Print it, or keep it on a phone's lock screen. A new code invalidates every card already printed with the old one.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4 border-t border-mhl-rule pt-4">
          <div className="min-w-0">
            <p className="text-mhl-body font-semibold text-mhl-ink">Require a PIN?</p>
            <p className="mt-0.5 text-mhl-fine text-mhl-muted">A responder enters it before the card opens.</p>
          </div>
          <Switch checked={emergency.pinEnabled} onChange={togglePin} label="Require a PIN" />
        </div>

        {emergency.pinEnabled && emergency.pin && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-mhl-sm bg-mhl-sunk px-4 py-3">
            <span className="select-all text-mhl-lead font-bold tracking-[0.2em] text-mhl-ink">{emergency.pin}</span>
            <div className="flex flex-none items-center gap-3">
              <CopyButton value={emergency.pin} label="Copy PIN" />
            </div>
          </div>
        )}
      </Section>

      <Section question="What does a responder see?" lead="The exact card your code opens — every toggle below changes it live.">
        <EmergencyCard hideManageLink className="mt-4" />
      </Section>

      <Section question="What should the card show?" lead="Tick exactly what a responder may see.">
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
              onChange={(e) => void updateEmergency({ note: e.target.value })}
              hint="One or two lines a responder should read."
            />
          </div>
        )}

        <p className="mt-3 text-mhl-fine text-mhl-faint">Last updated {formatRelative(emergency.updatedAt)}</p>
      </Section>

      {regenError && (
        <p role="alert" className="rounded-mhl-sm bg-mhl-danger-lo px-3.5 py-3 text-mhl-fine font-medium text-mhl-danger">
          {regenError}
        </p>
      )}

      <ConfirmDialog
        open={regenOpen}
        title="Generate a new code?"
        message="The code on any card already printed or shared will stop working."
        confirmLabel={regenLoading ? "Generating…" : "Generate new code"}
        onConfirm={handleRegen}
        onClose={() => { setRegenOpen(false); setRegenError(null); }}
      />
    </div>
  );
}
