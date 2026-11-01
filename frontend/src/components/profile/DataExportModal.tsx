import type { ReactNode } from "react";
import { useMemo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DocumentIcon, DownloadIcon } from "@/components/icons";
import { useRecords } from "@/store/RecordsContext";
import { useContexts } from "@/store/ContextsContext";
import { buildContextProfile, pregnancyLine } from "@/lib/healthContexts";
import { buildContextRows, priorityRows } from "@/components/context/ContextRows";
import {
  downloadClinicalSummary,
  downloadFhirBundle,
  recordCounts,
  type RecordSnapshot,
  type SummaryFocus,
} from "@/lib/export";

function ExportOption({
  icon,
  title,
  desc,
  cta,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-mhl-sm border border-mhl-rule p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
          {icon}
        </span>
        <h3 className="text-mhl-body font-semibold text-mhl-ink">{title}</h3>
      </div>
      <p className="mt-2 text-mhl-fine text-mhl-muted">{desc}</p>
      <div className="mt-3">
        <Button variant="secondary" icon={<DownloadIcon size={18} />} onClick={onClick}>
          {cta}
        </Button>
      </div>
    </div>
  );
}

/** Download the whole record — as FHIR for another system, or a one-page summary for a doctor. */
export function DataExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rec = useRecords();
  const { active } = useContexts();
  const snapshot: RecordSnapshot = {
    profile: rec.profile,
    allergies: rec.allergies,
    medications: rec.medications,
    conditions: rec.conditions,
    appointments: rec.appointments,
    documents: rec.documents,
    immunizations: rec.immunizations,
    procedures: rec.procedures,
    vitals: rec.vitals,
  };
  const counts = recordCounts(snapshot);

  // If a condition-aware profile is open, the one-page summary leads with it — built
  // from the same records, in the same priority order the app shows. The FHIR export
  // stays the whole record: a hospital needs the patient, not the lens.
  const focus = useMemo<SummaryFocus | undefined>(() => {
    if (!active) return undefined;
    const profile = buildContextProfile({ bundle: rec, ctx: active });
    const rows = priorityRows(buildContextRows({ profile }));
    return {
      label: profile.label,
      detail: profile.pregnancy ? pregnancyLine(profile.pregnancy) : undefined,
      highlights: rows.slice(0, 6).map((r) => ({ title: r.title, meta: r.meta })),
      others: profile.counts.rest,
    };
  }, [active, rec]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export your record"
      description="Take a copy with you — to another app, or to a doctor."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-3">
        <ExportOption
          icon={<DownloadIcon size={20} />}
          title="Full record · FHIR"
          desc="The HL7 FHIR format hospitals and health apps can read back in — one .json file."
          cta="Download FHIR"
          onClick={() => downloadFhirBundle(snapshot)}
        />
        <ExportOption
          icon={<DocumentIcon size={20} />}
          title="Clinical summary · one page"
          desc={
            focus
              ? `A printable snapshot a doctor can read in a minute — with your ${focus.label} profile leading it.`
              : "A printable snapshot a doctor can read in a minute: allergies, medicines, conditions, latest numbers."
          }
          cta="Download summary"
          onClick={() => downloadClinicalSummary(snapshot, focus)}
        />
      </div>
      {counts.length > 0 && (
        <p className="mt-4 text-mhl-fine text-mhl-muted">
          Includes {counts.map((c) => `${c.n} ${c.label}`).join("  ·  ")}.
        </p>
      )}
    </Modal>
  );
}
