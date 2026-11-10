/**
 * ModeBanner — the legible mechanism (PRODUCT principle 2).
 *
 * Sits under the app header on every screen while a non-normal mode is active:
 * what focus is on, that the full record is unchanged, and the way back.
 * Always reversible in one tap; never touches a record.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useAppMode } from "@/store/AppModeContext";
import { useContexts } from "@/store/ContextsContext";
import { useRecords } from "@/store/RecordsContext";
import { pregnancyView } from "@/lib/healthContexts";
import { ModeSwitchModal } from "@/components/profile/ModeSwitchModal";
import { CriticalConditionModal } from "@/components/modes/CriticalConditionModal";
import { HeartPulseIcon, LifebuoyIcon, SproutIcon } from "@/components/icons";

export function ModeBanner() {
  const { mode, meta, setMode, criticalConditionId } = useAppMode();
  const { contexts, active } = useContexts();
  const { conditions } = useRecords();
  const [switchOpen, setSwitchOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  const isActive = mode !== "standard";

  if (!isActive) {
    return null;
  }

  const Icon = mode === "pregnancy" ? SproutIcon : mode === "critical" ? HeartPulseIcon : LifebuoyIcon;
  const focusName = conditions.find((c) => c.id === criticalConditionId)?.name;
  const pregCtx = contexts.find((c) => c.kind === "LIFE_STAGE");
  const pregView = pregCtx ? pregnancyView(pregCtx) : null;

  const detail =
    mode === "pregnancy"
      ? pregView?.ageLabel
        ? `${pregView.ageLabel} along${pregView.dueDateLabel ? ` · due ${pregView.dueDateLabel}` : ""}`
        : "Antenatal visits, key readings and dates lead"
      : mode === "critical"
        ? focusName
          ? `${focusName} leads: treatment, schedule and numbers first`
          : "One condition leads: treatment, schedule and numbers first"
        : "Bigger text, fewer choices, medicines first";

  const profileTo = active ? `/app/contexts/${active.id}` : "/app/contexts";
  const isElderly = mode === "elderly";

  return (
    <>
      <div
        role="status"
        className={cn(
          "mhl-mode-banner border-b",
          isElderly
            ? "border-mhl-accent/30 bg-mhl-accent-lo"
            : "border-mhl-accent/25 bg-mhl-accent-lo/70",
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-[42rem] items-center gap-2.5 px-4 lg:px-8",
            isElderly ? "py-3" : "py-2",
          )}
        >
          <span
            className={cn(
              "grid flex-none place-items-center rounded-full bg-mhl-accent text-white",
              isElderly ? "h-10 w-10" : "h-7 w-7",
            )}
          >
            <Icon size={isElderly ? 20 : 15} />
          </span>
          <p className={cn("min-w-0 flex-1 truncate", isElderly && "whitespace-normal")}>
            <span className={cn("font-bold text-mhl-ink", isElderly ? "text-mhl-body" : "text-mhl-fine")}>
              {meta.pill}
              <span className="font-medium text-mhl-muted"> · {detail}</span>
            </span>
            {!isElderly && (
              <span className="block truncate text-[0.72rem] text-mhl-muted">
                Full record unchanged · reversible any time
              </span>
            )}
          </p>
          {mode !== "elderly" && (
            <Link
              to={profileTo}
              className="flex-none rounded-full px-2.5 py-1 text-mhl-fine font-semibold text-mhl-accent hover:bg-mhl-accent/10"
            >
              View focus
            </Link>
          )}
          {(mode === "critical" || mode === "pregnancy") && (
            <button
              type="button"
              onClick={() => setFocusOpen(true)}
              className="hidden flex-none rounded-full px-2.5 py-1 text-mhl-fine font-semibold text-mhl-accent hover:bg-mhl-accent/10 sm:block"
            >
              {mode === "critical" ? "Change focus" : "Edit dates"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSwitchOpen(true)}
            className={cn(
              "flex-none rounded-full font-semibold text-mhl-accent hover:bg-mhl-accent/10",
              isElderly ? "px-4 py-2.5 text-mhl-body" : "px-2.5 py-1 text-mhl-fine",
            )}
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => setMode("standard")}
            className={cn(
              "flex-none rounded-full bg-mhl-surface font-semibold text-mhl-ink hover:bg-mhl-sunk",
              isElderly ? "border border-mhl-rule px-4 py-2.5 text-mhl-body" : "px-2.5 py-1 text-mhl-fine",
            )}
          >
            {isElderly ? "Normal view" : "Normal"}
          </button>
        </div>
      </div>
      <ModeSwitchModal open={switchOpen} onClose={() => setSwitchOpen(false)} />
      <CriticalConditionModal
        open={focusOpen}
        mode={mode === "pregnancy" ? "pregnancy" : "critical"}
        onClose={() => setFocusOpen(false)}
        onDone={() => setFocusOpen(false)}
      />
    </>
  );
}

