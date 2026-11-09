import { describe, expect, it } from "vitest";
import { allergyConflict, readingBand, summaryInsights, type InsightInput } from "./summaryInsights";

const base: InsightInput = {
  allergies: [],
  conditions: [],
  medications: [],
  readings: [],
  bloodType: "O+",
  contactCount: 1,
};

describe("allergyConflict", () => {
  it("matches a medicine in an allergic class", () => {
    expect(allergyConflict("Amoxicillin 500 mg", "Penicillin")).toMatch(/penicillin/);
    expect(allergyConflict("Septrin", "Sulfa drugs")).toMatch(/sulfonamide/);
    expect(allergyConflict("Ibuprofen", "NSAIDs")).toMatch(/nsaid/);
  });

  it("matches the substance itself", () => {
    expect(allergyConflict("Penicillin V", "penicillin")).not.toBeNull();
  });

  it("does not flag unrelated medicines", () => {
    expect(allergyConflict("Metformin", "Penicillin")).toBeNull();
    expect(allergyConflict("Paracetamol", "Peanuts")).toBeNull();
  });
});

describe("readingBand", () => {
  it("flags a hypertensive crisis as critical", () => {
    expect(readingBand({ vitalType: "BLOOD_PRESSURE", value: 182, value2: 110 })?.level).toBe("critical");
  });
  it("flags stage-2 range as a warning and leaves normal alone", () => {
    expect(readingBand({ vitalType: "BLOOD_PRESSURE", value: 150, value2: 95 })?.level).toBe("warning");
    expect(readingBand({ vitalType: "BLOOD_PRESSURE", value: 118, value2: 76 })).toBeNull();
  });
  it("converts mg/dL glucose before judging it", () => {
    expect(readingBand({ vitalType: "BLOOD_GLUCOSE", value: 45, unit: "mg/dL" })?.level).toBe("critical");
    expect(readingBand({ vitalType: "BLOOD_GLUCOSE", value: 100, unit: "mg/dL" })).toBeNull();
  });
  it("flags low oxygen", () => {
    expect(readingBand({ vitalType: "SPO2", value: 88 })?.level).toBe("critical");
  });
});

describe("summaryInsights", () => {
  it("puts anaphylaxis and allergy conflicts before everything else", () => {
    const insights = summaryInsights({
      ...base,
      allergies: [{ substance: "Penicillin", severity: "ANAPHYLAXIS", reactions: ["Throat swelling"] }],
      medications: [{ name: "Amoxicillin", active: true }],
      readings: [{ vitalType: "BLOOD_PRESSURE", value: 150, value2: 92 }],
    });
    expect(insights[0].level).toBe("critical");
    expect(insights.slice(0, 2).map((i) => i.title).join(" ")).toMatch(/Anaphylaxis.*Amoxicillin|Amoxicillin.*Anaphylaxis/);
    expect(insights.find((i) => i.section === "readings")?.level).toBe("warning");
  });

  it("flags medicines unsafe in pregnancy only when pregnant", () => {
    const meds = [{ name: "Lisinopril 10 mg", active: true }];
    expect(summaryInsights({ ...base, medications: meds }).some((i) => i.title.includes("pregnancy"))).toBe(false);
    const pregnant = summaryInsights({ ...base, medications: meds, pregnant: true });
    expect(pregnant[0]).toMatchObject({ level: "critical", section: "medications" });
  });

  it("raises medicine–condition cautions", () => {
    const insights = summaryInsights({
      ...base,
      medications: [{ name: "Diclofenac", active: true }, { name: "Metformin", active: true }],
      conditions: [{ name: "Chronic kidney disease", status: "ACTIVE" }],
    });
    expect(insights.filter((i) => i.section === "medications")).toHaveLength(2);
  });

  it("surfaces abnormal lab results, critical first", () => {
    const insights = summaryInsights({
      ...base,
      labFindings: [
        { metric: "Sodium", value: "131", status: "low", source: "U&E" },
        { metric: "Potassium", value: "6.8", status: "critical", source: "U&E" },
      ],
    });
    expect(insights[0].title).toMatch(/Potassium/);
  });

  it("keeps owner-only housekeeping out of the public view", () => {
    const input = { ...base, bloodType: null, contactCount: 0 };
    expect(summaryInsights(input).some((i) => i.level === "info")).toBe(true);
    expect(summaryInsights({ ...input, publicView: true }).some((i) => i.level === "info")).toBe(false);
  });

  it("ignores stopped medicines", () => {
    const insights = summaryInsights({
      ...base,
      allergies: [{ substance: "Penicillin", severity: "MILD" }],
      medications: [{ name: "Amoxicillin", active: false }],
    });
    expect(insights.some((i) => i.title.includes("Amoxicillin"))).toBe(false);
  });
});
