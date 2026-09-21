import { cn } from "@/lib/cn";
import { QrPlaceholder, qrSvgMarkup } from "@/components/emergency/QrPlaceholder";
import { Button } from "@/components/ui/Button";
import { DownloadIcon, ShareIcon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import { providerAccessLabel, summariseScopes, type ProviderAccess, type ShareScope } from "@/types/sharing";
import { CopyButton } from "./CopyButton";

interface ShareCodePanelProps {
  code: string;
  pin?: string;
  expiresAt?: string;
  access: ProviderAccess;
  scopes: ShareScope[];
  className?: string;
}

/** The thing you actually hand to a provider: a QR + human-readable code, an
    optional PIN, and a plain summary of what it unlocks. Shown on creating a grant
    and whenever you reopen "Show code". Download saves the code as an SVG; Share
    opens the device sheet (or copies a ready message where sharing isn't available). */
export function ShareCodePanel({ code, pin, expiresAt, access, scopes, className }: ShareCodePanelProps) {
  function download() {
    const blob = new Blob([qrSvgMarkup(code)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `myhealthlog-code-${code}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function share() {
    const text = `Open my health record on myHealthLog with code ${code}${
      pin ? ` (PIN ${pin})` : ""
    }.`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "myHealthLog access code", text });
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
          <QrPlaceholder token={code} size={128} className="block text-mhl-ink" />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-mhl-fine text-mhl-muted">Share code</p>
          <div className="mt-1 flex items-center justify-center gap-3 sm:justify-start">
            <span className="select-all text-mhl-title font-bold tracking-[0.1em] text-mhl-ink">{code}</span>
            <CopyButton value={code} />
          </div>

          {pin && (
            <div className="mt-2 flex items-center justify-center gap-3 sm:justify-start">
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
              Share
            </Button>
            <Button variant="secondary" icon={<DownloadIcon size={18} />} onClick={download}>
              Download code
            </Button>
          </div>

          {pin && (
            <p className="mt-2 text-mhl-fine text-mhl-muted">Send the PIN a different way from the code.</p>
          )}
        </div>
      </div>
    </div>
  );
}
