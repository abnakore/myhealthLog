import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { useSharing } from "@/store/SharingContext";
import { emergencyUrl } from "@/lib/emergency";
import { qrSvgMarkup } from "@/lib/qrcode";
import { isCriticalAllergy } from "@/types/health";
import { ShieldIcon, DownloadIcon, ShareIcon, CheckIcon, LockIcon } from "@/components/icons";
import { QrCode } from "./QrCode";

interface EmergencyCardProps {
  className?: string;
  /** On the settings page the card is its own preview, so the "manage" link is hidden
      and an honest "this is what a responder sees" line takes its place. */
  hideManageLink?: boolean;
}

/** Join a list for the card, keeping it to one short line: "A, B, C +2". */
function capList(items: string[], max = 3): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} +${items.length - max}`;
}

/** The emergency block — on the dashboard it's the person's live card; on the
    Emergency access page it's the preview of the very same thing. Kept in the
    near-black high-contrast register (readable in any light, by anyone) and
    deliberately separate from the warm rest of the page. What it shows is driven by
    the emergency settings, so toggles there change this immediately. Download saves
    the code; Share opens the device sheet. */
export function EmergencyCard({ className, hideManageLink = false }: EmergencyCardProps) {
  const { profile, allergies, medications, conditions } = useRecords();
  const { emergency } = useSharing();
  const [copied, setCopied] = useState(false);

  const token = emergency.token;
  // The code carries the full public URL, never the bare token: scanning it must
  // open the emergency view directly, with nothing to type and nowhere to guess.
  const url = emergencyUrl(token);
  const critical = allergies.filter((a) => isCriticalAllergy(a.severity)).map((a) => a.substance);
  const activeMeds = medications.filter((m) => m.active).map((m) => m.name);
  const activeConditions = conditions.filter((c) => c.status === "ACTIVE").map((c) => c.name);
  const primaryContact = [...profile.emergencyContacts].sort((a, b) => a.priority - b.priority)[0];
  const note = emergency.note.trim();

  function handleDownload() {
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

  async function handleShare() {
    const data = {
      title: "myHealthLog emergency card",
      text: `${profile.fullName} — critical health details`,
      url,
    };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(data);
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      }
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  const btn =
    "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-mhl-body font-semibold transition-colors";

  return (
    <section
      className={cn("rounded-mhl bg-mhl-emerg p-5 text-mhl-emerg-ink", className)}
      aria-label="Emergency card"
    >
      <div className="flex items-center gap-2 text-mhl-emerg-amber">
        <ShieldIcon size={20} />
        <h2 className="text-mhl-lead font-bold text-mhl-emerg-ink">Emergency card</h2>
      </div>
      <p className="mt-1 max-w-[34ch] text-mhl-fine text-mhl-emerg-muted">
        Show this to a first responder. It opens your critical details without unlocking your phone.
      </p>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex-none rounded-mhl-sm bg-white p-2.5">
          <QrCode
            value={url}
            size={104}
            className="block text-mhl-emerg"
            label="Emergency QR code — scan to open the emergency view"
          />
        </div>
        <dl className="min-w-0 space-y-2 text-mhl-fine">
          {emergency.showBloodType && (
            <div>
              <dt className="text-mhl-emerg-faint">Blood &amp; genotype</dt>
              <dd className="text-mhl-lead font-bold text-mhl-emerg-ink">
                {profile.bloodType ?? "—"} · {profile.genotype ?? "—"}
              </dd>
            </div>
          )}
          {emergency.showAllergies && (
            <div>
              <dt className="text-mhl-emerg-faint">Critical allergies</dt>
              <dd className="font-semibold text-mhl-emerg-ink">
                {critical.length > 0 ? critical.join(", ") : "None recorded"}
              </dd>
            </div>
          )}
          {emergency.showMedications && activeMeds.length > 0 && (
            <div>
              <dt className="text-mhl-emerg-faint">Current medicines</dt>
              <dd className="font-semibold text-mhl-emerg-ink">{capList(activeMeds)}</dd>
            </div>
          )}
          {emergency.showConditions && activeConditions.length > 0 && (
            <div>
              <dt className="text-mhl-emerg-faint">Ongoing conditions</dt>
              <dd className="font-semibold text-mhl-emerg-ink">{capList(activeConditions)}</dd>
            </div>
          )}
          {emergency.showContacts && primaryContact && (
            <div>
              <dt className="text-mhl-emerg-faint">Emergency contact</dt>
              <dd className="font-semibold text-mhl-emerg-ink">
                {primaryContact.name} · {primaryContact.phone}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {emergency.showNote && note && (
        <p className="mt-3 rounded-mhl-sm bg-mhl-emerg-ink/10 px-3 py-2 text-mhl-fine text-mhl-emerg-ink">
          {note}
        </p>
      )}

      {emergency.pinEnabled && (
        <p className="mt-3 flex items-center gap-1.5 text-[0.75rem] text-mhl-emerg-amber">
          <LockIcon size={14} />
          Protected with a PIN — a responder enters it to open your card.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={handleDownload}
          className={cn(btn, "bg-mhl-emerg-amber text-mhl-emerg hover:brightness-95")}
        >
          <DownloadIcon size={18} />
          Save code
        </button>
        <button
          type="button"
          onClick={handleShare}
          className={cn(btn, "border border-mhl-emerg-ink/25 text-mhl-emerg-ink hover:bg-mhl-emerg-ink/10")}
        >
          {copied ? <CheckIcon size={18} /> : <ShareIcon size={18} />}
          {copied ? "Link copied" : "Share"}
        </button>
      </div>

      <p aria-live="polite" className="mt-3 text-[0.75rem] text-mhl-emerg-faint">
        {hideManageLink ? (
          "This is exactly what a responder sees."
        ) : (
          <>
            You choose what shows here.{" "}
            <Link to="/app/emergency" className="font-semibold text-mhl-emerg-amber hover:underline">
              Manage emergency access
            </Link>
          </>
        )}
      </p>
    </section>
  );
}
