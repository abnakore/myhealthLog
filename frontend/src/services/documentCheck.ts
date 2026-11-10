/**
 * Confirm against the attached document before saving.
 *
 * When a record is saved with a file, the file is first read by the AI and
 * compared with the form (backend POST /v1/records/<kind>/check-document/).
 * If they differ, the person sees what they typed next to what the document
 * says and chooses, field by field, which to keep. Only then is the record
 * saved, with their choices applied.
 *
 * The UI is a single host component (DocumentCheckHost) that registers itself
 * here, so every add and edit form that saves through services/records.ts gets
 * the check without changes of its own. A failed or unavailable check never
 * blocks saving: the background review still compares the file afterwards.
 */
import { api, buildFormData } from "./api";
import type { ReviewMismatch } from "./records";

export interface DocumentCheckResult {
  status: "DONE" | "UNAVAILABLE";
  mismatches: ReviewMismatch[];
  summary: string;
}

export type DocumentCheckDecision = { action: "save"; apply: Record<string, unknown> } | { action: "cancel" };

export interface DocumentCheckHost {
  /** Show that the file is being read. Returns a function that hides it. */
  begin: () => () => void;
  /** Ask the person to choose; resolves with what to change before saving. */
  confirm: (result: DocumentCheckResult) => Promise<DocumentCheckDecision>;
}

/** How long the person waits for the comparison before the record is saved anyway. */
export const CHECK_TIMEOUT_MS = 45_000;

let host: DocumentCheckHost | null = null;

export function registerDocumentCheckHost(h: DocumentCheckHost): () => void {
  host = h;
  return () => {
    if (host === h) host = null;
  };
}

/** Thrown when the person goes back to edit instead of saving. */
export class DocumentCheckCancelled extends Error {
  constructor() {
    super("Not saved yet. Review the differences with the document, then save again.");
    this.name = "DocumentCheckCancelled";
  }
}

/** `/v1/records/medications/` or `/v1/records/medications/<id>/` -> its check-document URL. */
export function checkUrlFor(recordUrl: string): string {
  return `${recordUrl.replace(/\/?$/, "/")}check-document/`;
}

/**
 * Compare the form with the file and let the person decide. Returns the payload
 * to save (with any document values they chose), or throws DocumentCheckCancelled.
 */
export async function confirmAgainstDocument(
  recordUrl: string,
  payload: Record<string, unknown>,
  file: File,
): Promise<Record<string, unknown>> {
  if (!host) return payload;
  const done = host.begin();
  let result: DocumentCheckResult;
  try {
    const res = await api.post<DocumentCheckResult>(checkUrlFor(recordUrl), buildFormData({ ...payload, file }), {
      headers: { "Content-Type": "multipart/form-data" },
      // If the AI is slow, save anyway: the background review still compares the
      // file (reusing this reading, which the server caches) and notifies.
      timeout: CHECK_TIMEOUT_MS,
    });
    result = res.data;
  } catch {
    return payload; // a check that fails must never stop the person saving
  } finally {
    done();
  }
  if (result.status !== "DONE" || result.mismatches.length === 0) return payload;
  const decision = await host.confirm(result);
  if (decision.action === "cancel") throw new DocumentCheckCancelled();
  return { ...payload, ...decision.apply };
}
