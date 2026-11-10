import { cn } from "@/lib/cn";
import { QrCode } from "@/components/emergency/QrCode";
import { qrSvgMarkup } from "@/lib/qrcode";
import { Button } from "@/components/ui/Button";
import { DownloadIcon, ShareIcon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import { providerAccessLabel, summariseScopes, type ProviderAccess, type ShareScope } from "@/types/sharing";
import { CopyButton } from "./CopyButton";

interface ShareCodePanelProps {
  code: string;
  /** The absolute link the code opens — a small window, not the signed-in app. */
  link: string;
  pin?: string;
  expiresAt?: string;
  access: ProviderAccess;
  scopes: ShareScope[];
  className?: string;
}

/** The thing you actually hand to a provider: a link (with a scannable QR of it),
 *  the PIN that unlocks it, and a plain summary of what it opens. The provider needs
 *  no account — opening the link and entering the PIN is the whole flow. */
export function ShareCodePanel({
  code,
  link,
  pin,
  expiresAt,
  access,
  scopes,
  className,
}: ShareCodePanelProps) {
  function download() {
    const blob = new Blob([qrSvgMarkup(link)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `myhealthlog-access-${code}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function share() {
    const text = `Open this window to see part of my health record: ${link}${
      pin ? `\nPIN: ${pin}` : ""
    }`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "myHealthLog access", text });
        return;
      }
      await navigator.clipboard?.writeText(text);
    } catch {
      /* dismissed or unavailable — nothing to do */
    }
  }

  return (
    <div className={cn("rounded-mhl-sm bg-mhl-sunk p-4", className)}>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="flex-none rounded-mhl-sm bg-white p-3 shadow-sm">
          {/* The QR carries the access link itself — scanning it lands straight on the
              PIN screen, with no address to type. */}
          <QrCode
            value={link}
            size={128}
            className="block text-mhl-ink"
            label="QR code carrying the provider access link"
          />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-mhl-fine text-mhl-muted">Access link</p>
          <p className="mt-1 select-all break-all text-mhl-fine font-semibold text-mhl-ink">
            {link}
          </p>
          <div className="mt-1.5 flex items-center justify-center gap-3 sm:justify-start">
            <CopyButton value={link} label="Copy link" />
            <span className="text-mhl-fine text-mhl-faint">Code {code}</span>
          </div>

          {pin && (
            <div className="mt-2.5 flex items-center justify-center gap-3 sm:justify-start">
              <span className="text-mhl-body font-semibold text-mhl-ink">
                PIN <span className="select-all tracking-[0.1em]">{pin}</span>
              </span>
              <CopyButton value={pin} label="Copy PIN" />
            </div>
          )}

          <p className="mt-2 text-mhl-fine text-mhl-muted">
            {providerAccessLabel(access)} · {summariseScopes(scopes)}
          </p>
          <p className="mt-0.5 text-mhl-fine text-mhl-faint">
            {expiresAt ? `Expires ${formatDate(expiresAt)}` : "Stays open until you revoke it"}
          </p>

          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button variant="secondary" icon={<ShareIcon size={18} />} onClick={share}>
              Share link
            </Button>
            <Button variant="secondary" icon={<DownloadIcon size={18} />} onClick={download}>
              Download QR
            </Button>
          </div>

          <p className="mt-2 text-mhl-fine text-mhl-muted">
            {pin
              ? "No account is needed. Send the PIN a different way from the link."
              : "No account is needed. Anyone with this link can open what you chose."}
          </p>
        </div>
      </div>
    </div>
  );
}
