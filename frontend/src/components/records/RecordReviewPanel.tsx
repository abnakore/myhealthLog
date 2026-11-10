/**
 * RecordReviewPanel: what the automatic review found for this record.
 *
 * Three parts, in the order the backend produces them (apps/records/review.py):
 *   1. Safety checks from fixed rules: allergy clashes, medicine cautions for the
 *      person's conditions and pregnancy, readings in a danger band or that look
 *      like a typing mistake. Each one names the rule behind it.
 *   2. Differences between the form and the attached document, with a one-tap
 *      "use the document's value" when the document has a clear value.
 *   3. A short AI note, clearly labelled, which explains but never overrides 1.
 */
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  fetchRecordReview,
  rerunRecordReview,
  type RecordReview,
  type ReviewFinding,
  type ReviewMismatch,
} from "@/services/records";
import { apiErrorMessage } from "@/services/api";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { CheckIcon, CopilotIcon, InfoIcon } from "@/components/icons";

const LEVEL: Record<ReviewFinding["level"], { label: string; box: string; chip: string }> = {
  critical: {
    label: "Urgent",
    box: "border-[oklch(0.82_0.08_28)] bg-mhl-accent-lo/70",
    chip: "bg-mhl-danger text-white",
  },
  warning: {
    label: "Check",
    box: "border-[oklch(0.86_0.07_75)] bg-[oklch(0.97_0.03_85)]",
    chip: "bg-[oklch(0.62_0.13_65)] text-white",
  },
  info: { label: "Note", box: "border-mhl-rule bg-mhl-sunk/50", chip: "bg-mhl-sunk text-mhl-muted" },
};

const URGENCY: Record<string, string> = {
  urgent: "Act today",
  soon: "Raise it soon",
  routine: "Mention at your next visit",
  none: "Nothing to act on",
};

/** The `basis` changes whenever the record or its file analysis changes, which re-fetches the review. */
export function RecordReviewPanel({
  routeKey,
  recordId,
  basis,
  canEdit,
  onApply,
}: {
  routeKey: string;
  recordId: string;
  basis: string;
  canEdit: boolean;
  onApply?: (m: ReviewMismatch) => Promise<void>;
}) {
  const [review, setReview] = useState<RecordReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReview(await fetchRecordReview(routeKey, recordId));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [routeKey, recordId]);

  useEffect(() => {
    let alive = true;
    fetchRecordReview(routeKey, recordId)
      .then((r) => {
        if (alive) {
          setReview(r);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) setError(apiErrorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [routeKey, recordId, basis]);

  // The worker usually finishes within seconds; poll while it is still running.
  useEffect(() => {
    if (review?.status !== "PENDING") return;
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [review?.status, load]);

  const rerun = async () => {
    setBusy(true);
    try {
      setReview(await rerunRecordReview(routeKey, recordId));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (m: ReviewMismatch) => {
    if (!onApply) return;
    setApplying(m.field);
    try {
      await onApply(m);
      window.setTimeout(() => void load(), 1200);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setApplying(null);
    }
  };

  if (!review && !error) {
    return (
      <div className="flex items-center gap-2 rounded-mhl border border-mhl-rule bg-mhl-surface p-5 text-mhl-fine text-mhl-muted">
        <Spinner size={14} /> Checking this record...
      </div>
    );
  }

  const findings = review?.findings ?? [];
  const mismatches = review?.mismatches ?? [];
  const insight = review?.aiInsight ?? null;
  const pending = review?.status === "PENDING";
  const none = review?.status === "NONE";

  return (
    <section aria-labelledby="review-title" className="rounded-mhl border border-mhl-rule bg-mhl-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="review-title" className="text-mhl-card font-bold text-mhl-ink">Record check</h2>
          <p className="mt-0.5 text-mhl-fine text-mhl-muted">
            Safety rules first, then a short AI note. This is information, not medical advice.
          </p>
        </div>
        {canEdit && (
          <Button variant="secondary" size="md" disabled={busy || pending} onClick={() => void rerun()}>
            {busy || pending ? "Checking..." : none ? "Run a check" : "Check again"}
          </Button>
        )}
      </div>

      {error && <p className="mt-3 text-mhl-fine font-semibold text-mhl-danger">{error}</p>}

      {pending && (
        <p className="mt-4 flex items-center gap-2 text-mhl-fine text-mhl-muted">
          <Spinner size={14} /> Checking this record against your allergies, conditions and medicines...
        </p>
      )}

      {none && !pending && (
        <p className="mt-4 text-mhl-fine text-mhl-muted">This record has not been checked yet.</p>
      )}

      {!none && !pending && findings.length === 0 && mismatches.length === 0 && (
        <p className="mt-4 flex items-center gap-2 text-mhl-fine font-semibold text-mhl-good">
          <CheckIcon size={16} /> No problems found by the safety rules.
        </p>
      )}

      {findings.length > 0 && (
        <ul className="mt-4 space-y-2">
          {findings.map((f, i) => {
            const tone = LEVEL[f.level] ?? LEVEL.info;
            return (
              <li key={`${f.rule}-${i}`} className={cn("rounded-mhl-sm border p-3", tone.box)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide", tone.chip)}>
                    {tone.label}
                  </span>
                  <span className="text-mhl-body font-semibold text-mhl-ink">{f.title}</span>
                </div>
                <p className="mt-1 text-mhl-fine text-mhl-ink">{f.detail}</p>
                <p className="mt-1 text-[0.7rem] text-mhl-faint">Rule: {f.rule}</p>
              </li>
            );
          })}
        </ul>
      )}

      {mismatches.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-mhl-fine font-semibold uppercase tracking-wide text-mhl-muted">
            Does not match the attached document
          </h3>
          <ul className="space-y-2">
            {mismatches.map((m) => (
              <li key={`${m.field}-${m.document}`} className="rounded-mhl-sm border border-mhl-rule p-3">
                <p className="text-mhl-fine text-mhl-ink">{m.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-mhl-fine">
                  <span className="text-mhl-muted">
                    Form: <b className="text-mhl-ink">{m.form || "empty"}</b>
                  </span>
                  <span className="text-mhl-muted">
                    Document: <b className="text-mhl-ink">{m.document}</b>
                  </span>
                  {canEdit && m.suggestion && onApply && (
                    <Button size="md" disabled={applying === m.field} onClick={() => void apply(m)}>
                      {applying === m.field ? "Updating..." : `Use ${m.suggestion}`}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {insight && (
        <div className="mt-4 rounded-mhl-sm border border-mhl-rule bg-mhl-sunk/40 p-3">
          <p className="flex items-center gap-1.5 text-mhl-fine font-semibold uppercase tracking-wide text-mhl-muted">
            <CopilotIcon size={14} /> AI note
            {insight.urgency && (
              <span className="ml-auto normal-case tracking-normal text-mhl-ink">{URGENCY[insight.urgency]}</span>
            )}
          </p>
          <p className="mt-1.5 text-mhl-body text-mhl-ink">{insight.summary}</p>
          {insight.points.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-mhl-fine text-mhl-ink">
              {insight.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>
      )}
      {review?.aiStatus === "FAILED" && (
        <p className="mt-3 flex items-center gap-1.5 text-[0.75rem] text-mhl-faint">
          <InfoIcon size={13} /> The AI note could not be written this time. The safety checks above still apply.
        </p>
      )}
    </section>
  );
}
