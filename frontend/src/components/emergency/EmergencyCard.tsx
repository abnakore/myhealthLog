import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useSharing } from "@/store/SharingContext";
import { useFocusFacets } from "@/store/careFocusStore";
import { emergencyUrl } from "@/lib/emergency";
import { isCriticalAllergy } from "@/types/health";
import { ShieldIcon, DownloadIcon, ShareIcon, CheckIcon, LockIcon } from "@/components/icons";
import { QrCode } from "./QrCode";
import { EmergencyCardExport } from "./EmergencyCardExport";
import { useEmergencyCardInput } from "./useEmergencyCardInput";

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
  const { isProxyView, activeOwnerName } = useCareProxy();
  const { emergency } = useSharing();
  // The care focus: conditions in it are listed first and named under the list.
  const facets = useFocusFacets();
  const focusNames = facets.conditionIds
    .map((id) => conditions.find((c) => c.id === id))
    .filter((c) => c?.status === "ACTIVE")
    .map((c) => c!.name);
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const ownerName = activeOwnerName || profile.fullName;

  const token = emergency.token;
  // The code carries the full public URL, never the bare token: scanning it must
  // open the emergency view directly, with nothing to type and nowhere to guess.
  const url = emergencyUrl(token);
  const critical = allergies.filter((a) => isCriticalAllergy(a.severity)).map((a) => a.substance);
  const activeMeds = medications.filter((m) => m.active).map((m) => m.name);
  const primaryContact = [...profile.emergencyContacts].sort((a, b) => a.priority - b.priority)[0];
  const note = emergency.note.trim();

  // The printed/downloaded card is the same record, drawn to scale. One source
  // keeps the preview, the PNG and the print sheet from drifting apart.
  const card = useEmergencyCardInput();

  async function handleShare() {
    const data = {
      title: "myHealthLog emergency card",
      text: `${profile.fullName}: critical health details`,
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
    "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-mhl-body font-semibold transition-[background-color,filter,transform] duration-150 ease-mhl active:scale-[0.985]";

  return (
    <section
      className={cn(
        "mhl-dash__emerg mhl-emerg-card min-w-0 rounded-mhl bg-mhl-emerg p-5 text-mhl-emerg-ink shadow-[0_18px_40px_-28px_oklch(0.2_0.05_40/0.75)]",
        className,
      )}
      aria-label="Emergency card"
    >
      {/* The PIN promise is a property of the card — it lives in the head, not as
          a footnote, but appears only when the pin is actually enabled. */}
      <div className="flex items-center gap-2.5">
        <span className="flex-none text-mhl-emerg-amber">
          <ShieldIcon size={22} strokeWidth={1.9} />
        </span>
        <h2 className="min-w-0 flex-1 text-mhl-card font-bold text-mhl-emerg-ink">
          Emergency card
        </h2>
        {emergency.pinEnabled && (
          <span className="inline-flex flex-none items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-[0.75rem] font-semibold text-mhl-emerg-ink">
            <LockIcon size={13} />
            PIN protected
          </span>
        )}
      </div>
      <p className="mt-1 max-w-[46ch] text-[0.84rem] leading-snug text-mhl-emerg-muted">
        {isProxyView
          ? `Show this to a first responder. It opens ${ownerName}'s selected critical details.`
          : "Show this to a first responder. It opens your selected critical details."}
      </p>

      <div className="mt-3.5 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
        <div className="w-fit flex-none self-start rounded-[0.85rem] bg-white p-2.5">
          <QrCode
            value={url}
            size={100}
            className="block text-mhl-emerg"
            label="Emergency QR code. Scan to open the emergency view"
          />
        </div>
        <dl className="min-w-0 space-y-1.5 text-[0.88rem] leading-tight">
          {emergency.showBloodType && (
            <div>
              <dt className="text-[0.78rem] text-mhl-emerg-muted">Blood &amp; genotype</dt>
              <dd className="font-semibold text-mhl-emerg-ink [font-variant-numeric:tabular-nums]">
                {profile.bloodType ?? "Not recorded"} · {profile.genotype ?? "Not recorded"}
              </dd>
            </div>
          )}
          {emergency.showConditions && card.pregnancy && (
            <div>
              <dt className="text-[0.78rem] text-mhl-emerg-muted">Pregnancy</dt>
              <dd className="font-semibold text-mhl-emerg-amber">{card.pregnancy}</dd>
            </div>
          )}
          {emergency.showAllergies && (
            <div>
              <dt className="text-[0.78rem] text-mhl-emerg-muted">Critical allergies</dt>
              <dd className="font-semibold text-mhl-emerg-ink">
                {critical.length > 0 ? critical.join(", ") : "None recorded"}
              </dd>
            </div>
          )}
          {emergency.showMedications && activeMeds.length > 0 && (
            <div>
              <dt className="text-[0.78rem] text-mhl-emerg-muted">Current medications</dt>
              <dd className="font-semibold text-mhl-emerg-ink">{capList(activeMeds)}</dd>
            </div>
          )}
          {emergency.showConditions && (
            <div>
              <dt className="text-[0.78rem] text-mhl-emerg-muted">Active conditions</dt>
              <dd className="font-semibold text-mhl-emerg-ink">
                {card.conditions.length > 0 ? capList(card.conditions) : "None recorded"}
              </dd>
              {focusNames.length > 0 && (
                <dd className="mt-1 text-mhl-fine text-mhl-emerg-amber">
                  In your care focus: {focusNames.join(", ")}. Listed first.
                </dd>
              )}
            </div>
          )}
          {emergency.showContacts && primaryContact && (
            <div>
              <dt className="text-[0.78rem] text-mhl-emerg-muted">Emergency contact</dt>
              <dd className="font-semibold text-mhl-emerg-ink [font-variant-numeric:tabular-nums]">
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

      <div className="mt-3.5 flex gap-2.5">
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className={cn(
            btn,
            "mhl-interactive bg-mhl-accent-mid text-mhl-emerg hover:brightness-[1.03]",
          )}
        >
          <DownloadIcon size={18} />
          Save or print
        </button>
        <button
          type="button"
          onClick={handleShare}
          className={cn(
            btn,
            "mhl-interactive border border-mhl-emerg-ink/25 text-mhl-emerg-ink hover:bg-mhl-emerg-ink/10",
          )}
        >
          {copied ? <CheckIcon size={18} /> : <ShareIcon size={18} />}
          {copied ? "Link copied" : "Share"}
        </button>
      </div>

      <div className="mt-3 flex items-start gap-1.5 text-[0.78rem] leading-snug text-mhl-emerg-muted">
        {emergency.pinEnabled && (
          <span className="mt-[0.15rem] flex-none text-mhl-emerg-amber">
            <LockIcon size={14} />
          </span>
        )}
        <p className="min-w-0 flex-1">
          {emergency.pinEnabled ? (
            <>
              <span className="underline decoration-mhl-emerg-muted/60 underline-offset-2">
                Protected with a PIN
              </span>
              . A responder enters it to open {isProxyView ? `${ownerName}'s` : "your"} card.
            </>
          ) : (
            "You choose what shows on this card."
          )}
        </p>
        {hideManageLink ? (
          <span aria-live="polite" className="flex-none text-mhl-emerg-faint">
            As a responder sees it
          </span>
        ) : (
          <Link
            to="/app/emergency"
            className="flex-none rounded-full pb-1 pl-2 font-semibold text-mhl-emerg-amber transition-colors hover:text-mhl-emerg-ink"
          >
            Manage
          </Link>
        )}
      </div>

      <EmergencyCardExport open={exportOpen} onClose={() => setExportOpen(false)} card={card} />
    </section>
  );
}
