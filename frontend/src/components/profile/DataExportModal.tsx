import type { ReactNode } from "react";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DocumentIcon, DownloadIcon } from "@/components/icons";
import { apiErrorMessage } from "@/services/api";
import {
  downloadFhirBundleFromApi,
  downloadClinicalSummaryFromApi,
} from "@/services/export";

function ExportOption({
  icon,
  title,
  desc,
  cta,
  onClick,
  loading,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
  loading?: boolean;
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
        <Button
          variant="secondary"
          icon={<DownloadIcon size={18} />}
          onClick={onClick}
          loading={loading}
          disabled={loading}
        >
          {cta}
        </Button>
      </div>
    </div>
  );
}

/** Download the whole record via the backend API — FHIR or one-page HTML summary. */
export function DataExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fhirLoading, setFhirLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFhir() {
    setFhirLoading(true);
    setError(null);
    try {
      await downloadFhirBundleFromApi();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setFhirLoading(false);
    }
  }

  async function handleSummary() {
    setSummaryLoading(true);
    setError(null);
    try {
      await downloadClinicalSummaryFromApi();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export your record"
      description="Take a copy with you, to another app, or to a doctor."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-mhl-sm bg-mhl-danger-lo px-3.5 py-3 text-mhl-fine font-medium text-mhl-danger"
        >
          {error}
        </p>
      )}
      <div className="space-y-3">
        <ExportOption
          icon={<DownloadIcon size={20} />}
          title="Full record · FHIR"
          desc="The HL7 FHIR format hospitals and health apps can read back in. One .json file."
          cta="Download FHIR"
          onClick={handleFhir}
          loading={fhirLoading}
        />
        <ExportOption
          icon={<DocumentIcon size={20} />}
          title="Clinical summary · one page"
          desc="A printable snapshot a doctor can read in a minute: allergies, medicines, conditions, latest numbers."
          cta="Download summary"
          onClick={handleSummary}
          loading={summaryLoading}
        />
      </div>
    </Modal>
  );
}
