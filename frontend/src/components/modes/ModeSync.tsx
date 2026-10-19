/**
 * ModeSync — the one-way bridge between the mode switch and the profile engine.
 *
 * Choosing a mode opens the matching lens so every surface reads one truth:
 *  • pregnancy → the pregnancy profile (created on first entry)
 *  • critical  → the chosen condition's profile
 *  • elderly   → the record stays whole; only the dashboard reshapes
 *  • normal    → the lens closes; the complete record, nothing hidden
 *
 * It renders nothing. Stepping between records re-runs it for the new owner,
 * because both the mode and the active profile are remembered per person.
 */
import { useEffect } from "react";
import { useAppMode } from "@/store/AppModeContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useRecords } from "@/store/RecordsContext";
import { useContexts } from "@/store/ContextsContext";
import { findPregnancy, contextForCondition } from "@/lib/healthContexts";

export function ModeSync() {
  const { mode, criticalConditionId } = useAppMode();
  const { activeOwnerId } = useCareProxy();
  const { conditions } = useRecords();
  const { contexts, activeId, activate, deactivate, openCondition, openPregnancy } = useContexts();

  useEffect(() => {
    if (mode === "pregnancy") {
      const existing = findPregnancy(contexts);
      if (existing) {
        if (activeId !== existing.id) activate(existing.id);
      } else {
        openPregnancy();
      }
    } else if (mode === "critical") {
      const target =
        conditions.find((c) => c.id === criticalConditionId) ??
        conditions.find((c) => c.status === "ACTIVE") ??
        conditions[0];
      if (!target) {
        if (activeId) deactivate();
        return;
      }
      const existing = contextForCondition(contexts, target.id);
      if (existing) {
        if (activeId !== existing.id) activate(existing.id);
      } else {
        openCondition(target);
      }
    } else if (activeId) {
      // Normal + elderly read the whole record — the lens closes.
      deactivate();
    }
    // Intentionally keyed on mode + owner + condition list, not on activeId:
    // this is a one-way bridge (mode → lens), and re-running it on every
    // activation would fight the user's own profile switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeOwnerId, criticalConditionId, conditions.length]);

  return null;
}
