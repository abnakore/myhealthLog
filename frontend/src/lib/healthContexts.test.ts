/**
 * The condition-aware engine's tests.
 *
 * They are written against the scenarios in the feature brief — one describe block per
 * scenario — because the risk here is never "does the code run" but "does a profile
 * stay a lens": that it copies nothing, claims nothing it wasn't told, hides nothing
 * permanently, and works on a record with no links at all.
 *
 * The demo record is used as the fixture (`@/data/mock`) rather than hand-built toys, so
 * a change to the real record's data is what breaks these tests.
 */
import { describe, expect, it } from "vitest";
import {
  BASIS_LABELS,
  buildContextProfile,
  conditionContext,
  contextConditionIds,
  contextForCondition,
  contextHeadline,
  contextLabel,
  contextsOf,
  dueDateOf,
  findPregnancy,
  gestationalAgeOf,
  isPregnancy,
  linkedRecordCount,
  mentionsName,
  pregnancyContext,
  pregnancyLine,
  pregnancyView,
} from "@/lib/healthContexts";
import { demoContexts, demoRecordBundles } from "@/data/mock";
import {
  emptyCollections,
  emptyRecordBundle,
  type Allergy,
  type Condition,
  type HealthProfile,
  type Medication,
  type RecordBundle,
  type VitalReading,
} from "@/types/health";
import type { HealthContext } from "@/types/context";

/* ---------------------------------------------------------------- fixtures -- */

const NOW = new Date("2026-09-15T09:00:00");

function condition(id: string, name: string): Condition {
  return { id, name, status: "ACTIVE" };
}

function medication(id: string, name: string, extra: Partial<Medication> = {}): Medication {
  return {
    id,
    name,
    dosage: "500 mg",
    frequency: "Twice daily",
    startDate: "2026-01-10",
    active: true,
    ...extra,
  };
}

function bundleWith(overrides: Partial<RecordBundle> = {}): RecordBundle {
  const profile: HealthProfile = { id: "p_test", fullName: "Test Person", emergencyContacts: [] };
  return { profile, ...emptyCollections(), ...overrides };
}

/** The seeded record, with its own contexts — the shape a user actually has. */
const amina = demoRecordBundles.p_amina;
const diabetes = demoContexts.find((c) => c.conditionId === "cn_1") as HealthContext;
const asthma = demoContexts.find((c) => c.conditionId === "cn_3") as HealthContext;

/* -------------------------------------------------------------- the basics -- */

describe("context helpers", () => {
  it("tolerates a record saved before condition-aware profiles existed", () => {
    const oldRecord = { ...bundleWith() } as RecordBundle;
    delete (oldRecord as { contexts?: unknown }).contexts;
    expect(contextsOf(oldRecord)).toEqual([]);
    expect(() => buildContextProfile({ bundle: oldRecord, ctx: diabetes, now: NOW })).not.toThrow();
  });

  it("anchors a condition context on the existing condition, not on a copied one", () => {
    const ctx = conditionContext(condition("cn_x", "Asthma"));
    expect(ctx.conditionId).toBe("cn_x");
    expect(ctx.kind).toBe("CONDITION");
    // The context carries no clinical fields of its own, so there is nothing to drift.
    expect(Object.keys(ctx).sort()).toEqual(
      ["conditionId", "createdAt", "id", "kind", "updatedAt"].sort(),
    );
  });

  it("names a context from the condition it points at", () => {
    const conditions = [condition("cn_x", "Asthma"), condition("cn_y", "Type 2 diabetes")];
    expect(contextLabel(conditionContext(conditions[0]), conditions)).toBe("Asthma");
    expect(contextLabel(pregnancyContext(), conditions)).toBe("Pregnancy");
  });
});


/* ------------------------------------- Scenario 1 — no condition relationships -- */

describe("Scenario 1 — records with no condition links", () => {
  const bundle = bundleWith({
    conditions: [condition("cn_d", "Type 2 diabetes")],
    medications: [medication("md_a", "Vitamin D3")],
    vitals: [
      { id: "vt_a", vitalType: "WEIGHT", value: 70, unit: "kg", measuredAt: "2026-09-01T07:00:00" },
    ],
  });
  const ctx = conditionContext(bundle.conditions[0]);

  it("invents no relationship and shows honest empty sections", () => {
    const profile = buildContextProfile({ bundle, ctx, now: NOW });
    expect(profile.medications).toEqual([]);
    expect(profile.vitals).toEqual([]);
    expect(profile.conditions.map((p) => p.record.id)).toEqual(["cn_d"]);
    expect(profile.counts.linked).toBe(0);
  });

  it("still counts every record, so nothing looks deleted", () => {
    const profile = buildContextProfile({ bundle, ctx, now: NOW });
    expect(profile.counts.total).toBe(3);
    expect(profile.counts.shown).toBe(1);
    expect(profile.counts.rest).toBe(2);
  });

  it("leaves the record itself untouched", () => {
    const before = JSON.stringify(bundle);
    buildContextProfile({ bundle, ctx, now: NOW });
    expect(JSON.stringify(bundle)).toBe(before);
  });
});

/* ------------------------------------------------- Scenario 2 — one condition -- */

describe("Scenario 2 — one condition with its own records", () => {
  const bundle = bundleWith({
    conditions: [condition("cn_d", "Type 2 diabetes")],
    medications: [
      medication("md_metformin", "Metformin", { conditionIds: ["cn_d"], reason: "Type 2 diabetes" }),
      medication("md_other", "Amlodipine", { reason: "High blood pressure" }),
    ],
    vitals: [
      {
        id: "vt_glu",
        vitalType: "BLOOD_GLUCOSE",
        value: 7.1,
        unit: "mmol/L",
        measuredAt: "2026-09-02T06:45:00",
        conditionIds: ["cn_d"],
      } as VitalReading,
    ],
  });
  const profile = buildContextProfile({
    bundle,
    ctx: conditionContext(bundle.conditions[0]),
    now: NOW,
  });

  it("surfaces exactly the linked records, tagged as linked", () => {
    expect(profile.medications.map((p) => p.record.name)).toEqual(["Metformin"]);
    expect(profile.medications[0].basis).toBe("LINKED");
    expect(profile.vitals.map((p) => p.record.id)).toEqual(["vt_glu"]);
  });

  it("hands back the original record object, not a copy of it", () => {
    expect(profile.medications[0].record).toBe(bundle.medications[0]);
    expect(profile.vitals[0].record).toBe(bundle.vitals[0]);
  });
});

/* ------------------------------------------- Scenario 3 — multiple conditions -- */

describe("Scenario 3 — two conditions, neither profile eating the other", () => {
  const bundle = bundleWith({
    conditions: [condition("cn_d", "Type 2 diabetes"), condition("cn_h", "High blood pressure")],
    medications: [
      medication("md_metformin", "Metformin", { conditionIds: ["cn_d"] }),
      medication("md_amlodipine", "Amlodipine", { conditionIds: ["cn_h"] }),
    ],
  });

  it("gives each profile its own records", () => {
    const d = buildContextProfile({ bundle, ctx: conditionContext(bundle.conditions[0]), now: NOW });
    const h = buildContextProfile({ bundle, ctx: conditionContext(bundle.conditions[1]), now: NOW });
    expect(d.medications.map((p) => p.record.name)).toEqual(["Metformin"]);
    expect(h.medications.map((p) => p.record.name)).toEqual(["Amlodipine"]);
    // Both profiles still count the whole record.
    expect(d.counts.total).toBe(4);
    expect(h.counts.total).toBe(4);
  });
});

/* ------------------------------- Scenario 4 — one record, several conditions -- */

describe("Scenario 4 — a record linked to more than one condition", () => {
  const bundle = bundleWith({
    conditions: [condition("cn_h", "High blood pressure"), condition("cn_f", "Heart failure")],
    medications: [medication("md_lisinopril", "Lisinopril", { conditionIds: ["cn_h", "cn_f"] })],
  });

  it("appears in both profiles", () => {
    for (const c of bundle.conditions) {
      const profile = buildContextProfile({ bundle, ctx: conditionContext(c), now: NOW });
      expect(profile.medications.map((p) => p.record.id)).toEqual(["md_lisinopril"]);
    }
  });

  it("keeps the link itself intact when a profile is built", () => {
    buildContextProfile({ bundle, ctx: conditionContext(bundle.conditions[0]), now: NOW });
    expect(bundle.medications[0].conditionIds).toEqual(["cn_h", "cn_f"]);
  });

/* ------------------------------------------ Scenario 5 — unrelated records -- */

describe("Scenario 5 — an unrelated record is not claimed by a profile", () => {
  const bundle = bundleWith({
    conditions: [condition("cn_d", "Type 2 diabetes")],
    procedures: [
      {
        id: "pr_appendix",
        name: "Appendectomy",
        performedOn: "2011-06-20",
        facility: "Aminu Kano Teaching Hospital",
        outcome: "Uncomplicated recovery.",
      },
    ],
    documents: [
      {
        id: "doc_fbc",
        title: "Full blood count",
        docType: "LAB_RESULT",
        fileName: "fbc.pdf",
        fileSize: 1000,
        uploadedAt: "2020-01-05T10:00:00",
      },
    ],
  });

  it("leaves old, unrelated records out of the profile — and on the record", () => {
    const profile = buildContextProfile({
      bundle,
      ctx: conditionContext(bundle.conditions[0]),
      now: NOW,
    });
    expect(profile.procedures).toEqual([]);
    expect(profile.documents).toEqual([]);
    expect(profile.counts.rest).toBe(2);
    expect(bundle.procedures).toHaveLength(1);
    expect(bundle.documents).toHaveLength(1);
  });

  it("offers an unlinked record only when its own words name the condition", () => {
    const recent = bundleWith({
      conditions: [condition("cn_d", "Type 2 diabetes")],
      documents: [
        // Names the condition in its own words — surfaced as a mention, offered for linking.
        {
          id: "doc_mention",
          title: "Diabetes lab report",
          docType: "LAB_RESULT",
          fileName: "hba1c.pdf",
          fileSize: 1000,
          uploadedAt: "2026-08-28T14:10:00",
        },
        // Recent but says nothing about the condition — left out, still on the record.
        {
          id: "doc_quiet",
          title: "Full blood count",
          docType: "LAB_RESULT",
          fileName: "fbc.pdf",
          fileSize: 1000,
          uploadedAt: "2026-08-28T14:10:00",
        },
      ],
    });
    const profile = buildContextProfile({
      bundle: recent,
      ctx: conditionContext(recent.conditions[0]),
      now: NOW,
    });
    expect(profile.documents.map((p) => p.record.id)).toEqual(["doc_mention"]);
    expect(profile.documents[0].basis).toBe("MENTION");
    expect(profile.documents[0].linkable).toBe(true);
    expect(profile.counts.rest).toBe(1);
    expect(BASIS_LABELS.MENTION).toBe("Mentioned");
  });

  it("recognises a record whose own words name the condition", () => {
    expect(mentionsName("Review diabetes control", "Type 2 diabetes")).toBe(true);
    expect(mentionsName("Blood pressure check", "High blood pressure")).toBe(true);
    expect(mentionsName("prediabetes screening", "Type 2 diabetes")).toBe(false);
    expect(mentionsName("Routine check-up", "Type 2 diabetes")).toBe(false);
  });
});

/* -------------------------------------------- Scenario 6 — allergy ≠ condition -- */

describe("Scenario 6 — asthma stays a condition, pollen stays an allergy", () => {
  const profile = buildContextProfile({ bundle: amina, ctx: asthma, now: NOW });

  it("keeps the allergy an allergy while surfacing it in the asthma profile", () => {
    const pollen = profile.allergies.find((p) => p.record.substance === "Pollen");
    expect(pollen).toBeDefined();
    expect(pollen?.basis).toBe("LINKED");
    expect(profile.conditions.map((p) => p.record.name)).not.toContain("Pollen");
    expect(amina.conditions.some((c) => c.name === "Pollen")).toBe(false);
  });

  it("does not surface an unrelated allergy just because it exists", () => {
    expect(profile.allergies.map((p) => p.record.substance)).not.toContain("Sulfa drugs");
    expect(amina.allergies.some((a) => a.substance === "Sulfa drugs")).toBe(true);
  });

  it("keeps a severe allergy visible as a critical fact, not as a condition record", () => {
    expect(profile.critical.allergies.map((a) => a.substance)).toContain("Penicillin");
    expect(profile.conditions.map((p) => p.record.name)).not.toContain("Penicillin");
  });
});


/* ------------------------------------------------------ Scenario 7 — pregnancy -- */

describe("Scenario 7 — the pregnancy context", () => {
  const pregnancy = pregnancyContext({
    id: "ctx_preg",
    kind: "LIFE_STAGE",
    key: "pregnancy",
    createdAt: "2026-09-01T08:00:00",
    pregnancy: {
      status: "ONGOING",
      lastMenstrualPeriod: "2026-03-01",
      gravida: 3,
      para: 1,
      miscarriages: 1,
      complications: ["Anaemia"],
    },
  } as HealthContext);

  it("works the dates out from the record's own ones", () => {
    const age = gestationalAgeOf(pregnancy, NOW);
    expect(age?.weeks).toBe(28);
    expect(age?.trimester).toBe(3);
    expect(dueDateOf(pregnancy)).toBe("2026-12-06");
    expect(pregnancyLine(pregnancyView(pregnancy, NOW))).toBe(
      "28 weeks 2 days pregnant  ·  due 6 Dec 2026",
    );
    expect(isPregnancy(pregnancy)).toBe(true);
  });

  it("derives the gestation from a due date when the LMP is unknown", () => {
    const byDueDate = pregnancyContext({
      id: "ctx_p2",
      kind: "LIFE_STAGE",
      key: "pregnancy",
      createdAt: "2026-09-01T08:00:00",
      pregnancy: { status: "ONGOING", estimatedDueDate: "2026-12-06" },
    } as HealthContext);
    expect(gestationalAgeOf(byDueDate, NOW)?.weeks).toBe(28);
  });

  it("carries the context's own facts and pulls the record's existing ones", () => {
    const profile = buildContextProfile({ bundle: amina, ctx: pregnancy, now: NOW });
    expect(profile.pregnancy?.statusLabel).toBe("Ongoing");
    expect(profile.pregnancy?.ageLabel).toBe("28 weeks 2 days");
    expect(profile.pregnancy?.complications).toEqual(["Anaemia"]);
    expect(profile.pregnancy?.gravida).toBe(3);
    // Existing records, referenced — the current medicines and the allergies she has.
    expect(profile.medications.map((p) => p.record.name).sort()).toEqual([
      "Amlodipine",
      "Metformin",
    ]);
    expect(profile.allergies.map((p) => p.record.substance)).toContain("Penicillin");
  });

  it("leaves an old, unrelated procedure out of the pregnancy profile", () => {
    const profile = buildContextProfile({ bundle: amina, ctx: pregnancy, now: NOW });
    expect(profile.procedures.map((p) => p.record.name)).not.toContain("Appendectomy");
    expect(amina.procedures.map((p) => p.name)).toContain("Appendectomy");
  });

  it("shows a pregnancy with no dates entered as undated, not as broken", () => {
    const bare = buildContextProfile({ bundle: amina, ctx: pregnancyContext(), now: NOW });
    expect(bare.pregnancy?.ageLabel).toBeUndefined();
    expect(bare.pregnancy?.dueDateLabel).toBeUndefined();
    expect(bare.pregnancy?.statusLabel).toBe("Ongoing");
  });

  it("finds the one pregnancy context on a record", () => {
    expect(findPregnancy([diabetes, pregnancy])?.id).toBe("ctx_preg");
    expect(findPregnancy([diabetes, asthma])).toBeUndefined();
  });
});


/* ------------------------------------- Scenarios 8 and 9 — leaving a profile -- */

describe("Scenarios 8 and 9 — back to the whole record, and deactivating", () => {
  it("leaves every collection present and complete after profiles are read", () => {
    const before = JSON.stringify(amina);
    buildContextProfile({ bundle: amina, ctx: asthma, now: NOW });
    buildContextProfile({ bundle: amina, ctx: diabetes, now: NOW });
    expect(JSON.stringify(amina)).toBe(before);
    expect(Object.keys(amina).sort()).toEqual(
      [
        "allergies",
        "appointments",
        "conditions",
        "contexts",
        "documents",
        "immunizations",
        "medications",
        "profile",
        "procedures",
        "vitals",
      ].sort(),
    );
  });

  it("removes only the lens when a context is taken off the record", () => {
    const remaining = [diabetes, asthma].filter((c) => c.id !== asthma.id);
    expect(remaining.map((c) => c.id)).toEqual([diabetes.id]);
    expect(contextForCondition(remaining, "cn_3")).toBeUndefined();
    // The records the asthma profile pointed at are all still there.
    expect(amina.medications.some((m) => m.id === "md_3")).toBe(true);
    expect(amina.vitals.some((v) => v.conditionIds?.includes("cn_3"))).toBe(true);
  });

  it("counts what is linked, for the profiles screen", () => {
    expect(linkedRecordCount(amina, ["cn_1"])).toBeGreaterThan(0);
    expect(linkedRecordCount(amina, ["cn_missing"])).toBe(0);
  });
});

/* ------------------------------------ a record that has nothing at all on it -- */

describe("a context on an empty record", () => {
  it("renders with nothing at all rather than failing", () => {
    const empty = emptyRecordBundle("p_new", "New Person");
    const profile = buildContextProfile({ bundle: empty, ctx: pregnancyContext(), now: NOW });
    expect(profile.counts.total).toBe(0);
    expect(profile.counts.shown).toBe(0);
    expect(profile.critical.allergies).toEqual([]);
    expect(contextHeadline(profile.ctx, empty.conditions).label).toBe("Pregnancy");
  });
});

/* ------------------------------------------- the emergency view's one-liner -- */

describe("context headline", () => {
  it("names a condition context by the condition's own name", () => {
    expect(contextHeadline(asthma, amina.conditions).label).toBe("Asthma");
    expect(contextHeadline(asthma, amina.conditions).detail).toBeUndefined();
  });

  it("carries the pregnancy's dates as its detail", () => {
    const pregnancy = pregnancyContext({
      id: "ctx_p3",
      kind: "LIFE_STAGE",
      key: "pregnancy",
      createdAt: "2026-09-01T08:00:00",
      pregnancy: { status: "ONGOING", lastMenstrualPeriod: "2026-03-01" },
    } as HealthContext);
    const headline = contextHeadline(pregnancy, [], NOW);
    expect(headline.label).toBe("Pregnancy");
    expect(headline.detail).toContain("28 weeks 2 days");
  });

  it("covers every condition a context is anchored on", () => {
    const ctx: HealthContext = {
      id: "ctx_multi",
      kind: "CONDITION",
      conditionId: "cn_d",
      conditionIds: ["cn_d", "cn_h"],
      createdAt: "2026-09-01T08:00:00",
    };
    expect(contextConditionIds(ctx)).toEqual(["cn_d", "cn_h"]);
  });
});

/* -------------------------------------------------------- allergy edge case -- */

describe("allergies and conditions stay separate types", () => {
  it("keeps an unlinked allergy off a profile even when it is severe", () => {
    const allergy: Allergy = {
      id: "al_peanut",
      substance: "Peanut",
      allergyType: "FOOD",
      severity: "ANAPHYLAXIS",
    };
    const bundle = bundleWith({
      conditions: [condition("cn_a", "Asthma")],
      allergies: [allergy],
    });
    const profile = buildContextProfile({
      bundle,
      ctx: conditionContext(bundle.conditions[0]),
      now: NOW,
    });
    expect(profile.allergies).toEqual([]);
    // …but it is still a critical fact about the person, so the critical block holds it.
    expect(profile.critical.allergies.map((a) => a.substance)).toEqual(["Peanut"]);
  });
});

});
