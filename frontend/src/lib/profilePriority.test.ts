import { describe, expect, it } from "vitest";
import { clinicalUrgency, mentionsName, recordText } from "./healthContexts";

describe("condition profiles find what matters", () => {
  it("reads markers and medicines as being about a condition", () => {
    expect(mentionsName("HbA1c 8.4 %", "Type 2 diabetes")).toBe(true);
    expect(mentionsName("Metformin 500 mg", "Type 2 diabetes")).toBe(true);
    expect(mentionsName("Lisinopril 10 mg", "Hypertension")).toBe(true);
    expect(mentionsName("Paracetamol", "Type 2 diabetes")).toBe(false);
    // Word-bounded: still never matches a different condition by substring.
    expect(mentionsName("Prediabetes screen", "Diabetes")).toBe(false);
  });

  it("counts what the AI read from an attached file", () => {
    const doc = {
      title: "Chem path",
      aiExtraction: { summary: "Raised fasting glucose.", key_findings: [{ metric: "HbA1c" }] },
    };
    expect(mentionsName(recordText("documents", doc), "Type 2 diabetes")).toBe(true);
  });

  it("puts the dangerous items first inside a profile", () => {
    expect(clinicalUrgency("allergies", { severity: "ANAPHYLAXIS" })).toBeLessThan(
      clinicalUrgency("allergies", { severity: "MILD" }),
    );
    expect(
      clinicalUrgency("vitals", { vitalType: "BLOOD_PRESSURE", value: 182, value2: 112 }),
    ).toBeLessThan(clinicalUrgency("vitals", { vitalType: "BLOOD_PRESSURE", value: 118, value2: 76 }));
    expect(
      clinicalUrgency("documents", { aiExtraction: { key_findings: [{ status: "critical" }] } }),
    ).toBe(0);
    expect(clinicalUrgency("medications", { active: true })).toBeLessThan(
      clinicalUrgency("medications", { active: false }),
    );
  });
});
