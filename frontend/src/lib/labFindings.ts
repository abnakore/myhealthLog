/**
 * Abnormal results the AI read from files on the record — lab reports and any
 * supporting document attached to a medication, condition, reading, etc.
 *
 * Used by the medical summary to flag, for example, a potassium of 5.9 that
 * only exists inside a PDF. Only results from the last year are considered so
 * a long-resolved abnormal value does not keep raising an alarm.
 */
import type { InsightLabFinding } from "@/lib/summaryInsights";
import type { AiExtractionResult } from "@/types/health";

interface WithExtraction {
  aiExtraction?: AiExtractionResult | null;
  aiExtractionStatus?: string;
  title?: string;
  name?: string;
  substance?: string;
  documentDate?: string;
  uploadedAt?: string;
}

const YEAR_MS = 365 * 86_400_000;

export function abnormalLabFindings(records: WithExtraction[], limit = 8): InsightLabFinding[] {
  const out: (InsightLabFinding & { sortKey: number })[] = [];
  for (const r of records) {
    const x = r.aiExtraction;
    if (r.aiExtractionStatus !== "DONE" || !x?.key_findings?.length) continue;
    const date = x.date || r.documentDate || r.uploadedAt || null;
    const when = date ? +new Date(date) : 0;
    if (when && Date.now() - when > YEAR_MS) continue;
    const source = x.title || r.title || r.name || r.substance || "an uploaded document";
    for (const f of x.key_findings) {
      if (!f.status || f.status === "normal") continue;
      out.push({
        metric: f.metric,
        value: f.value,
        unit: f.unit,
        status: f.status,
        referenceRange: f.reference_range,
        source,
        date,
        sortKey: (f.status === "critical" ? 0 : 1) * 1e15 - when,
      });
    }
  }
  // The same report is often attached twice (as a document and to a condition):
  // one result, one flag.
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.sortKey - b.sortKey)
    .filter((f) => {
      const key = `${f.metric.toLowerCase()}|${f.value}|${(f.date ?? "").slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((f) => {
      const { metric, value, unit, status, referenceRange, source, date } = f;
      return { metric, value, unit, status, referenceRange, source, date };
    });
}
