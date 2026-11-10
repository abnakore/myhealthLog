/**
 * "Save or print your card" — the one place the physical card is made.
 *
 * Everything offered here is the same drawing: the preview, the PNG saved to the
 * phone (for a lock screen or a widget), the printed sheet at 85.6 × 54 mm, and the
 * square QR on its own. Nothing is a screenshot and nothing is emailed anywhere —
 * the file is written by the browser, on the spot.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DownloadIcon, ShareIcon, PrinterIcon, CheckIcon } from "@/components/icons";
import { qrSvgMarkup } from "@/lib/qrcode";
import {
  buildEmergencyCardSvg,
  downloadBlob,
  printCard,
  svgDataUrl,
  svgToPngBlob,
  svgToPngBlobAt,
  type EmergencyCardInput,
} from "@/lib/emergencyCard";

interface EmergencyCardExportProps {
  open: boolean;
  onClose: () => void;
  card: EmergencyCardInput;
}

type Busy = null | "card" | "qr" | "share";

const QR_PX = 1024;

export function EmergencyCardExport({ open, onClose, card }: EmergencyCardExportProps) {
  const [busy, setBusy] = useState<Busy>(null);
  const [note, setNote] = useState<string | null>(null);

  const svg = useMemo(() => buildEmergencyCardSvg(card), [card]);
  const preview = useMemo(() => svgDataUrl(svg), [svg]);
  const filename = `myhealthlog-emergency-card-${card.name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "card"}`;

  function flash(message: string) {
    setNote(message);
    window.setTimeout(() => setNote(null), 2600);
  }

  async function saveCard() {
    setBusy("card");
    try {
      const blob = await svgToPngBlob(svg, 2);
      downloadBlob(blob, `${filename}.png`);
      flash("Card saved as a PNG image.");
    } catch {
      flash("The image couldn't be made in this browser. Try printing instead.");
    } finally {
      setBusy(null);
    }
  }

  async function saveQr() {
    setBusy("qr");
    try {
      const blob = await svgToPngBlobAt(qrSvgMarkup(card.url, QR_PX), QR_PX, QR_PX);
      downloadBlob(blob, "myhealthlog-emergency-code.png");
      flash("QR code saved.");
    } catch {
      flash("The QR image couldn't be made in this browser.");
    } finally {
      setBusy(null);
    }
  }

  function saveQrVector() {
    downloadBlob(
      new Blob([qrSvgMarkup(card.url, QR_PX)], { type: "image/svg+xml" }),
      "myhealthlog-emergency-code.svg",
    );
    flash("Vector QR code saved. Best for professional printing.");
  }

  async function share() {
    setBusy("share");
    const title = "myHealthLog emergency card";
    const text = `${card.name}: emergency health summary`;
    try {
      const blob = await svgToPngBlob(svg, 2);
      const file = new File([blob], `${filename}.png`, { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ title, text, files: [file] });
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url: card.url });
        return;
      }
      await navigator.clipboard.writeText(card.url);
      flash("Link copied. Send it on, or save the card as an image.");
    } catch {
      /* dismissed or unsupported — the other buttons still work */
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Save or print your card"
      description="A real-sized card (85.6 × 54 mm) for a wallet, a lock screen or a printer."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        {/* The drawing itself, at the card's own proportions. */}
        <div className="overflow-hidden rounded-mhl-sm border border-mhl-rule bg-mhl-sunk p-3">
          <img
            src={preview}
            alt="Preview of the emergency card, with the person's critical details and a QR code that opens their emergency summary."
            className="mx-auto block w-full rounded-[0.4rem] shadow-mhl"
            style={{ aspectRatio: "1011 / 638" }}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <ExportTile
            icon={<DownloadIcon size={20} />}
            title="Card image"
            hint="PNG, credit-card size"
            onClick={saveCard}
            busy={busy === "card"}
          />
          <ExportTile
            icon={<DownloadIcon size={20} />}
            title="QR code only"
            hint="Square PNG, 1024 px"
            onClick={saveQr}
            busy={busy === "qr"}
            secondaryAction={{ label: "SVG", onClick: saveQrVector }}
          />
          <ExportTile
            icon={<PrinterIcon size={20} />}
            title="Print the card"
            hint="At actual size, on card or paper"
            onClick={() => printCard(svg)}
          />
          <ExportTile
            icon={<ShareIcon size={20} />}
            title="Share"
            hint="Send the image or the link"
            onClick={share}
            busy={busy === "share"}
          />
        </div>

        <p aria-live="polite" className="min-h-5 text-mhl-fine text-mhl-muted">
          {note ?? ""}
        </p>

        <div className="rounded-mhl-sm bg-mhl-sunk px-3.5 py-3 text-mhl-fine leading-relaxed text-mhl-muted">
          <p>
            The QR always opens your emergency summary, the page a clinician reads first.
            Print two: one for your wallet, one for the fridge.
          </p>
          {card.pin && (
            <p className="mt-1 font-semibold text-mhl-ink">
              This card is PIN-protected. The PIN is printed on the card.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ExportTile({
  icon,
  title,
  hint,
  onClick,
  busy = false,
  secondaryAction,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  busy?: boolean;
  secondaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={cn(
          "mhl-interactive flex w-full min-h-16 items-center gap-3 rounded-mhl-sm border border-mhl-rule bg-mhl-surface px-3.5 py-3 text-left",
          "transition-colors hover:border-mhl-accent/50 hover:bg-mhl-accent-lo/40 disabled:opacity-60",
        )}
      >
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
          {busy ? <CheckIcon size={19} /> : icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-mhl-body font-semibold text-mhl-ink">{title}</span>
          <span className="block truncate text-mhl-fine text-mhl-muted">{hint}</span>
        </span>
      </button>
      {secondaryAction && (
        <button
          type="button"
          onClick={secondaryAction.onClick}
          className="absolute bottom-1.5 right-2 rounded px-1 text-[0.72rem] font-semibold text-mhl-muted hover:text-mhl-accent"
        >
          {secondaryAction.label}
        </button>
      )}
    </div>
  );
}
