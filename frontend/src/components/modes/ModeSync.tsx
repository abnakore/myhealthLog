/**
 * ModeSync: keeps the mode, the care focus and the open profile in step.
 *
 * 1. Focus and mode. The care focus (saved on the server) and the mode
 *    (remembered on this device) must never disagree, or the home screen
 *    shows an old focus under a new mode.
 *    - When the focus first loads, the server wins: the mode becomes the
 *      layout the top item asks for, so every device and the Copilot agree.
 *      A person who picked a mode before the focus existed has it saved.
 *    - After that, picking a single mode replaces the whole focus with that
 *      one mode (Normal clears it). A "several at once" save sets the mode
 *      itself, so it already agrees and is left alone.
 *
 * 2. Mode and profile. The mode opens the matching lens so every surface reads
 *    one truth:
 *    - pregnancy, or pregnancy with anything else: the pregnancy profile
 *    - critical: the focused condition's profile
 *    - elderly or normal: the whole record, no lens
 *
 * It renders nothing. Stepping between records re-runs it for the new owner,
 * because the mode, the focus and the active profile are all kept per person.
 */
import { useEffect, useRef } from "react";
import { useAppMode } from "@/store/AppModeContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useRecords } from "@/store/RecordsContext";
import { useContexts } from "@/store/ContextsContext";
import { useCareFocus } from "@/store/careFocusStore";
import { findPregnancy, contextForCondition } from "@/lib/healthContexts";
import { focusAgreesWithMode, primaryMode, refsForMode } from "@/lib/careFocus";

export function ModeSync() {
  const { mode, setMode, criticalConditionId, setCriticalConditionId } = useAppMode();
  const { activeOwnerId } = useCareProxy();
  const { conditions } = useRecords();
  const { contexts, activeId, activate, deactivate, openCondition, openPregnancy } = useContexts();
  const { ranked, loaded, save } = useCareFocus();
  const owner = activeOwnerId || "self";

  // The condition critical mode is about: the chosen one, else the first active.
  const target =
    conditions.find((c) => c.id === criticalConditionId) ??
    conditions.find((c) => c.status === "ACTIVE") ??
    conditions[0];

  // ---- 1a. First load for this person: adopt the server's focus. ----
  const reconciled = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || reconciled.current === owner) return;
    reconciled.current = owner;
    if (ranked.length > 0) {
      const next = primaryMode(ranked);
      // The highest-ranked condition is the one the rail card and its panel
      // name, even when pregnancy leads the layout.
      const firstCondition = ranked.find((r) => r.kind === "condition");
      if (firstCondition && firstCondition.id !== criticalConditionId) setCriticalConditionId(firstCondition.id);
      if (next !== mode) setMode(next);
    } else if (mode !== "standard") {
      // Critical mode with no condition chosen falls back to the first active
      // one; record it, so the focus and the screen name the same condition.
      if (mode === "critical" && target && target.id !== criticalConditionId) setCriticalConditionId(target.id);
      const refs = refsForMode(mode, target?.id);
      if (refs.length) void save(refs).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, owner]);

  // ---- 1b. A mode picked later: the focus follows it. ----
  // Keyed on the mode and the critical condition only, never on the focus
  // itself, so saving "several at once" is not undone half way through.
  useEffect(() => {
    if (!loaded || reconciled.current !== owner) return;
    const conditionId = mode === "critical" ? target?.id ?? "" : criticalConditionId;
    if (focusAgreesWithMode(ranked, mode, conditionId)) return;
    if (mode === "critical" && target && target.id !== criticalConditionId) setCriticalConditionId(target.id);
    void save(refsForMode(mode, target?.id)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, criticalConditionId]);

  // ---- 2. The lens. ----
  useEffect(() => {
    if (mode === "pregnancy") {
      const existing = findPregnancy(contexts);
      if (existing) {
        if (activeId !== existing.id) activate(existing.id);
      } else {
        openPregnancy();
      }
    } else if (mode === "critical") {
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
      // Normal and elderly read the whole record, so the lens closes.
      deactivate();
    }
    // Keyed on mode, owner and the condition list, not on activeId: this is a
    // one-way bridge (mode to lens), and re-running it on every activation
    // would fight the person's own profile switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeOwnerId, criticalConditionId, conditions.length]);

  return null;
}
