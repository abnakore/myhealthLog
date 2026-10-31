/**
 * ModeHint — a one-line focus note atop record pages (deep adaptation).
 *
 * Each mode reframes the same page without rewriting it: pregnancy names the
 * readings that matter, critical names the focused condition, elderly keeps
 * the reassurance ultra-short. Rendered only when a non-normal mode is on.
 */
import { Link } from "react-router-dom";
import { useAppMode } from "@/store/AppModeContext";
import { useRecords } from "@/store/RecordsContext";
import { pregnancyView } from "@/lib/healthContexts";
import { useContexts } from "@/store/ContextsContext";

/** The pages a mode can reframe. These are the *list* names — the same segments
 *  the record routes use — so a record detail page can carry the same hint. */
export type ModeHintPage =
  | "medications"
  | "measurements"
  | "conditions"
  | "appointments"
  | "documents"
  | "timeline"
  | "allergies";

export function ModeHint({ page }: { page: ModeHintPage }) {
  const { mode, criticalConditionId } = useAppMode();
  const { conditions } = useRecords();
  const { contexts } = useContexts();
  if (mode === "standard") return null;

  const focusName = conditions.find((c) => c.id === criticalConditionId)?.name;
  const pregCtx = contexts.find((c) => c.kind === "LIFE_STAGE");
  const pregView = pregCtx ? pregnancyView(pregCtx) : null;

  let text: string | null = null;
  if (mode === "pregnancy") {
    text =
      page === "measurements"
        ? `Weight, blood pressure and blood sugar lead${pregView?.ageLabel ? ` — ${pregView.ageLabel} along` : ""}.`
        : page === "appointments"
          ? "Antenatal visits lead — the dates your care team watches."
          : page === "medications"
            ? "Every medicine still listed — flag anything new with your care team."
            : "Read through your pregnancy — the full record is unchanged.";
  } else if (mode === "critical") {
    text = focusName
      ? page === "conditions"
        ? `${focusName} leads — its treatment, schedule and numbers first.`
        : `Shown with ${focusName} first — the full record is unchanged.`
      : "Pick a condition to focus — then its treatment and numbers lead.";
  } else {
    text =
      page === "medications"
        ? "Your daily doses, largest first — ask your carer if unsure."
        : "Simpler view, same record — everything is still here.";
  }

  if (!text) return null;
  return (
    <p
      role="note"
      className="mb-4 rounded-mhl-sm bg-mhl-accent-lo/70 px-3.5 py-2.5 text-mhl-fine text-mhl-ink"
    >
      <span className="font-semibold text-mhl-accent">
        {mode === "pregnancy" ? "Pregnancy focus" : mode === "critical" ? "Critical focus" : "Elderly view"}
      </span>{" "}
      · {text}{" "}
      <Link to="/app/contexts" className="font-semibold text-mhl-accent hover:underline">
        View focus
      </Link>
    </p>
  );
}
