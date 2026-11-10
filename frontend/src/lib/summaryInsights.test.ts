import { describe, expect, it } from "vitest";
import { readingBand, summaryInsights, type InsightInput } from "./summaryInsights";

const base: InsightInput = {
  allergies: [],
  conditions: [],
  medications: [],
  readings: [],
  bloodType: "O+",
  contactCount: 1,
};

describe("readingBand", () => {
  it("flags blood pressure above 180/120 as critical (ACC/AHA)", () => {
    expect(readingBand({ vitalType: "BLOOD_PRESSURE", value: 182, value2: 110 })?.level).toBe("critical");
    expect(readingBand({ vitalType: "BLOOD_PRESSURE", value: 180, value2: 110 })?.level).toBe("warning");
  });
  it("uses the pregnancy thresholds when pregnant (ACOG)", () => {
    const r = { vitalType: "BLOOD_PRESSURE", value: 162, value2: 100 };
    expect(readingBand(r)?.level).toBe("warning");
    expect(readingBand(r, { pregnant: true })?.level).toBe("critical");
  });
  it("uses the NEWS2 bands for pulse, breathing and temperature", () => {
    expect(readingBand({ vitalType: "PULSE", value: 131 })?.level).toBe("critical");
    expect(readingBand({ vitalType: "PULSE", value: 115 })?.level).toBe("warning");
    expect(readingBand({ vitalType: "RESPIRATORY_RATE", value: 22 })?.level).toBe("warning");
    expect(readingBand({ vitalType: "TEMPERATURE", value: 38.5, unit: "°C" })?.level).toBe("info");
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
    expect(readingBand({ vitalType: "SPO2", value: 91 })?.level).toBe("critical");
    expect(readingBand({ vitalType: "SPO2", value: 93 })?.level).toBe("warning");
    expect(readingBand({ vitalType: "SPO2", value: 95 })).toBeNull();
  });
});

describe("summaryInsights", () => {
  it("puts anaphylaxis and medicine findings before everything else", () => {
    const insights = summaryInsights({
      ...base,
      allergies: [{ substance: "Penicillin", severity: "ANAPHYLAXIS", reactions: ["Throat swelling"] }],
      medications: [{ name: "Amoxicillin", active: true }],
      medicineFlags: [{ medication: "Amoxicillin", level: "critical",
        title: "Amoxicillin is in the same family as your Penicillin allergy", detail: "Class 'Penicillins'." }],
      readings: [{ vitalType: "BLOOD_PRESSURE", value: 150, value2: 92 }],
    });
    expect(insights.slice(0, 2).every((i) => i.level === "critical")).toBe(true);
    expect(insights.slice(0, 2).map((i) => i.title).join(" ")).toMatch(/Anaphylaxis.*Amoxicillin/);
    expect(insights.find((i) => i.section === "readings")?.level).toBe("warning");
  });

  it("has no medicine rules of its own", () => {
    const insights = summaryInsights({
      ...base,
      allergies: [{ substance: "Penicillin", severity: "MILD" }],
      medications: [{ name: "Amoxicillin", active: true }, { name: "Lisinopril", active: true }],
      pregnant: true,
    });
    expect(insights.some((i) => i.section === "medications")).toBe(false);
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

  it("ignores findings about stopped medicines", () => {
    const insights = summaryInsights({
      ...base,
      medications: [{ name: "Amoxicillin", active: false }],
      medicineFlags: [{ medication: "Amoxicillin", level: "critical", title: "Clash", detail: "" }],
    });
    expect(insights.some((i) => i.section === "medications")).toBe(false);
  });
});
