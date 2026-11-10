/**
 * Data export API calls.
 * Maps to /api/v1/export/* endpoints.
 * The backend generates FHIR bundles and HTML summaries server-side;
 * we just trigger a download from the API response.
 */
import { api } from "./api";

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Download the user's FHIR R4 Bundle from the backend. */
export async function downloadFhirBundleFromApi(): Promise<void> {
  const res = await api.get("/v1/export/fhir/", {
    // No custom Accept header: the API negotiates on it, and an exotic type
    // there is refused with a 406 before the file is ever built.
    responseType: "blob",
  });
  triggerDownload(`myhealthlog-fhir-${stamp()}.json`, res.data as Blob);
}

/** Download the user's clinical HTML summary from the backend. */
export async function downloadClinicalSummaryFromApi(): Promise<void> {
  const res = await api.get("/v1/export/summary/", {
    responseType: "blob",
  });
  triggerDownload(`myhealthlog-summary-${stamp()}.html`, res.data as Blob);
}
