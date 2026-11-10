import { describe, expect, it } from "vitest";
import { conditionScore, focusAgreesWithMode, focusFacets, primaryMode, rankFocus, refsForMode, toggleFocus } from "./careFocus";

const conditions = [
  { id: "a", name: "Asthma", status: "ACTIVE", severity: "MILD" },
  { id: "d", name: "Type 2 diabetes", status: "ACTIVE", severity: "SEVERE" },
  { id: "h", name: "Hypertension", status: "IN_REMISSION", severity: null },
];

describe("care focus ranking", () => {
  it("puts pregnancy first, then conditions by severity, then elderly care", () => {
    const ranked = rankFocus(
      [{ kind: "elderly" }, { kind: "condition", id: "a" }, { kind: "pregnancy" }, { kind: "condition", id: "d" }],
      conditions,
    );
    expect(ranked.map((r) => r.label)).toEqual(["Pregnancy", "Type 2 diabetes", "Asthma", "Elderly care"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("matches the backend scores", () => {
    expect(conditionScore("ACTIVE", "SEVERE")).toBe(90);
    expect(conditionScore("ACTIVE", "MODERATE")).toBe(75);
    expect(conditionScore("ACTIVE", null)).toBe(70);
    expect(conditionScore("ACTIVE", "MILD")).toBe(60);
    expect(conditionScore("IN_REMISSION")).toBe(40);
    expect(conditionScore("RESOLVED")).toBe(20);
  });

  it("drops deleted conditions and duplicates", () => {
    const ranked = rankFocus(
      [{ kind: "condition", id: "gone" }, { kind: "condition", id: "h" }, { kind: "condition", id: "h" }],
      conditions,
    );
    expect(ranked.map((r) => r.id)).toEqual(["h"]);
  });

  it("breaks ties by name so the order is stable", () => {
    const twins = [
      { id: "1", name: "Zeta", status: "ACTIVE", severity: "SEVERE" },
      { id: "2", name: "Alpha", status: "ACTIVE", severity: "SEVERE" },
    ];
    expect(rankFocus([{ kind: "condition", id: "1" }, { kind: "condition", id: "2" }], twins).map((r) => r.label))
      .toEqual(["Alpha", "Zeta"]);
  });

  it("chooses the dashboard layout from the top item", () => {
    expect(primaryMode([])).toBe("standard");
    expect(primaryMode(rankFocus([{ kind: "condition", id: "a" }, { kind: "pregnancy" }], conditions))).toBe("pregnancy");
    expect(primaryMode(rankFocus([{ kind: "elderly" }, { kind: "condition", id: "a" }], conditions))).toBe("critical");
    expect(primaryMode(rankFocus([{ kind: "elderly" }], conditions))).toBe("elderly");
  });

  it("toggles items in and out", () => {
    const once = toggleFocus([], { kind: "condition", id: "a" });
    expect(once).toEqual([{ kind: "condition", id: "a" }]);
    expect(toggleFocus(once, { kind: "condition", id: "a" })).toEqual([]);
  });
});

describe("care focus and the mode", () => {
  it("maps a single mode to its focus", () => {
    expect(refsForMode("standard")).toEqual([]);
    expect(refsForMode("pregnancy")).toEqual([{ kind: "pregnancy" }]);
    expect(refsForMode("elderly")).toEqual([{ kind: "elderly" }]);
    expect(refsForMode("critical", "a")).toEqual([{ kind: "condition", id: "a" }]);
  });

  it("adapts to every item in focus, not only the first", () => {
    const ranked = rankFocus([{ kind: "elderly" }, { kind: "pregnancy" }, { kind: "condition", id: "a" }], conditions);
    const f = focusFacets(ranked, "pregnancy", "a");
    expect(f.primary).toBe("pregnancy");
    expect(f.pregnancy).toBe(true);
    expect(f.elderly).toBe(true);
    expect(f.conditionIds).toEqual(["a"]);
    expect(f.multi).toBe(true);
  });

  it("ignores an old focus once a different mode is picked", () => {
    const ranked = rankFocus([{ kind: "pregnancy" }, { kind: "elderly" }], conditions);
    expect(focusAgreesWithMode(ranked, "pregnancy", "")).toBe(true);
    expect(focusAgreesWithMode(ranked, "standard", "")).toBe(false);
    const f = focusFacets(ranked, "standard", "");
    expect(f.elderly).toBe(false);
    expect(f.pregnancy).toBe(false);
    expect(f.multi).toBe(false);
  });

  it("checks the focused condition in critical mode", () => {
    const ranked = rankFocus([{ kind: "condition", id: "d" }, { kind: "condition", id: "a" }], conditions);
    expect(focusAgreesWithMode(ranked, "critical", "d")).toBe(true);
    expect(focusAgreesWithMode(ranked, "critical", "a")).toBe(false);
  });
});
