import { useState } from "react";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { isCriticalAllergy } from "@/types/health";
import { ShieldIcon, DownloadIcon, ShareIcon, CheckIcon } from "@/components/icons";
import { QrPlaceholder, qrSvgMarkup } from "./QrPlaceholder";

interface EmergencyCardProps {
  token: string;
  className?: string;
}

/** The dashboard's emergency block. Kept in the near-black high-contrast register
    (readable in any light, by anyone) and deliberately separate from the warm rest
    of the page. Download saves the code; Share opens the device sheet. */
export function EmergencyCard({ token, className }: EmergencyCardProps) {
  const { profile, allergies } = useRecords();
  const [copied, setCopied] = useState(false);

  const critical = allergies.filter((a) => isCriticalAllergy(a.severity)).map((a) => a.substance);
  const primaryContact = [...profile.emergencyContacts].sort((a, b) => a.priority - b.priority)[0];

  function handleDownload() {
    const blob = new Blob([qrSvgMarkup(token)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "myhealthlog-emergency-code.svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    const shareUrl = window.location.origin;
    const data = {
      title: "myHealthLog emergency card",
      text: `${profile.fullName} — critical health details`,
      url: shareUrl,
    };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(data);
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
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
          <QrPlaceholder token={token} size={104} className="block text-mhl-emerg" />
        </div>
        <dl className="min-w-0 space-y-2 text-mhl-fine">
          <div>
            <dt className="text-mhl-emerg-faint">Blood &amp; genotype</dt>
            <dd className="text-mhl-lead font-bold text-mhl-emerg-ink">
              {profile.bloodType ?? "—"} · {profile.genotype ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-mhl-emerg-faint">Critical allergies</dt>
            <dd className="font-semibold text-mhl-emerg-ink">
              {critical.length > 0 ? critical.join(", ") : "None recorded"}
            </dd>
          </div>
          {primaryContact && (
            <div>
              <dt className="text-mhl-emerg-faint">Emergency contact</dt>
              <dd className="font-semibold text-mhl-emerg-ink">
                {primaryContact.name} · {primaryContact.phone}
              </dd>
            </div>
          )}
        </dl>
      </div>

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
        Preview only. Your live code is issued from Emergency settings, where it can be revoked.
      </p>
    </section>
  );
}
