/**
 * The integration edges of condition-aware profiles: the form plumbing that lets a
 * record carry its links, migration safety for records saved before this feature
 * existed, and — the one that matters most — that a contextual relationship never
 * widens what an emergency reader is allowed to see.
 */
import { describe, expect, it } from "vitest";
import {
  allergyFromDraft,
  allergyToDraft,
  appointmentFromDraft,
  appointmentToDraft,
  documentFromDraft,
  documentToDraft,
  emptyAllergyDraft,
  emptyAppointmentDraft,
  emptyDocumentDraft,
  emptyMedicationDraft,
  emptyVitalDraft,
  immunizationFromDraft,
  immunizationToDraft,
  medicationFromDraft,
  medicationToDraft,
  vitalFromDraft,
  vitalToDraft,
} from "@/components/records/model";
import { compileEmergencySummary, lastRecordUpdate } from "@/lib/emergency";
import { buildClinicalSummary } from "@/lib/export";
import { buildContextProfile, conditionContext, contextsOf } from "@/lib/healthContexts";
import { demoContexts, demoRecordBundles } from "@/data/mock";
import {
  emptyCollections,
  emptyRecordBundle,
  type HealthDocument,
  type RecordBundle,
} from "@/types/health";
import type { EmergencySettings } from "@/types/sharing";
import type { HealthContext } from "@/types/context";

const NOW = new Date("2026-09-15T09:00:00");
const amina = demoRecordBundles.p_amina;
const asthma = demoContexts.find((c) => c.conditionId === "cn_3") as HealthContext;

/** An emergency card whose owner has revealed every section. */
const openCard: EmergencySettings = {
  token: "tok",
  pinEnabled: false,
  showBloodType: true,
  showAllergies: true,
  showMedications: true,
  showConditions: true,
  showContacts: true,
  showNote: false,
  note: "",
  updatedAt: "2026-09-19T08:00:00",
};

/* ---------------------------------------------------- the link on a record -- */

describe("a record's condition links survive a round trip through its form", () => {
  it("reads links out of a medication and writes them back", () => {
    const links = ["cn_1", "cn_2"];
    const original = medicationFromDraft(
      { ...emptyMedicationDraft(), name: "Lisinopril", startDate: "2026-01-01", conditionIds: links },
      undefined,
    );
    expect(original.conditionIds).toEqual(links);

    const draft = medicationToDraft(original);
    expect(draft.conditionIds).toEqual(links);
    expect(medicationFromDraft(draft, original).conditionIds).toEqual(links);
  });

  it("keeps a record with no links a valid record", () => {
    const plain = medicationFromDraft({
      ...emptyMedicationDraft(),
      name: "Vitamin D3",
      startDate: "2026-01-01",
    });
    // Not an empty list waiting to be filled — simply no link at all.
    expect(plain.conditionIds).toBeUndefined();
    expect(medicationToDraft(plain).conditionIds).toEqual([]);
  });

  it("does the same for allergies, appointments and documents", () => {
    const allergy = allergyFromDraft({
      ...emptyAllergyDraft(),
      substance: "Pollen",
      conditionIds: ["cn_3"],
    });
    expect(allergyToDraft(allergy).conditionIds).toEqual(["cn_3"]);

    const visit = appointmentFromDraft({
      ...emptyAppointmentDraft(),
      title: "Asthma review",
      scheduledFor: "2026-10-01T09:00:00",
      conditionIds: ["cn_3"],
    });
    expect(appointmentToDraft(visit).conditionIds).toEqual(["cn_3"]);

    const doc: HealthDocument = documentFromDraft({
      ...emptyDocumentDraft("SCAN"),
      title: "Spirometry",
      documentDate: "2016-01-14",
      existingFileName: "spiro.pdf",
      existingFileSize: 100,
      conditionIds: ["cn_3"],
    });
    expect(documentToDraft(doc).conditionIds).toEqual(["cn_3"]);
  });

  it("does the same for a measurement and a vaccination", () => {
    const reading = vitalFromDraft({
      ...emptyVitalDraft("PEAK_FLOW"),
      value: "480",
      measuredAt: "2016-06-14T08:00",
      conditionIds: ["cn_3"],
    });
    expect(vitalToDraft(reading).conditionIds).toEqual(["cn_3"]);

    const jab = immunizationFromDraft({
      vaccine: "Influenza (seasonal)",
      doseNumber: "",
      administeredOn: "2025-10-20",
      nextDue: "",
      notes: "",
      conditionIds: [],
    });
    expect(immunizationToDraft(jab).conditionIds).toEqual([]);
  });
});

/* ----------------------------------------------------- migration safety -- */

describe("existing records keep working untouched", () => {
  it("treats a record with no contexts as a record with no profiles", () => {
    const legacy = {
      profile: { id: "p_old", fullName: "Old Record", emergencyContacts: [] },
      ...emptyCollections(),
    } as RecordBundle;
    delete (legacy as { contexts?: unknown }).contexts;

    expect(contextsOf(legacy)).toEqual([]);
    expect(legacy.medications).toEqual([]);
    expect(legacy.profile.fullName).toBe("Old Record");
  });

  it("builds a profile on a legacy record without inventing records for it", () => {
    const legacy = emptyRecordBundle("p_old", "Old Record");
    const profile = buildContextProfile({
      bundle: { ...legacy, conditions: [{ id: "cn_1", name: "Asthma", status: "ACTIVE" }] },
      ctx: conditionContext({ id: "cn_1", name: "Asthma", status: "ACTIVE" }),
      now: NOW,
    });
    expect(profile.counts.total).toBe(1);
    expect(profile.label).toBe("Asthma");
  });

  it("does not require the demo record's own links to be exhaustive", () => {
    // The seeded record deliberately leaves some records unlinked: a general check-up,
    // every weight reading, a blood count. Normal Mode must keep showing those wherever
    // a profile is open.
    expect(amina.appointments.some((a) => a.id === "ap_3" && a.conditionIds === undefined)).toBe(true);
    expect(amina.vitals.some((v) => v.id === "vt_wt4" && v.conditionIds === undefined)).toBe(true);
    expect(amina.documents.some((d) => d.id === "doc_1" && d.conditionIds === undefined)).toBe(true);
  });
});

/* ------------------------------ Scenario 10 — access control stays authoritative -- */

describe("Scenario 10 — a context never widens what a responder is allowed to see", () => {
  it("keeps a linked but unshared allergy out of what the card shows", () => {
    const bundle: RecordBundle = {
      ...amina,
      allergies: [{ ...amina.allergies[2], severity: "SEVERE" }], // Pollen, linked to asthma
    };
    // The owner's toggles — not the context — decide what the card shows.
    const hidden = compileEmergencySummary(
      bundle,
      { ...openCard, showAllergies: false },
      "p_amina",
      { label: "Asthma" },
    );
    expect(hidden.shows.allergies).toBe(false);

    // …and the very same record is shown when the owner has chosen to share it.
    const shared = compileEmergencySummary(bundle, openCard, "p_amina", { label: "Asthma" });
    expect(shared.shows.allergies).toBe(true);
    expect(shared.criticalAllergies.map((a) => a.substance)).toEqual(["Pollen"]);
  });

  it("only names the open profile when the owner already shares their conditions", () => {
    const headline = { label: "Asthma" };
    expect(compileEmergencySummary(amina, openCard, "p_amina", headline).context).toEqual(headline);
  });

  it("does not widen the card when the owner has hidden their conditions", () => {
    expect(
      compileEmergencySummary(amina, { ...openCard, showConditions: false }, "p_amina", {
        label: "Asthma",
      }).context,
    ).toBeUndefined();
  });

  it("leaves the card describing the whole person, not just the profile", () => {
    const summary = compileEmergencySummary(amina, openCard, "p_amina", { label: "Asthma" });
    // Asthma is a settled condition on this record, so it is not among the ongoing ones…
    expect(summary.conditions.map((c) => c.name)).not.toContain("Asthma");
    // …while the ongoing conditions and the current medicines are all still listed.
    expect(summary.conditions.map((c) => c.name)).toContain("Type 2 diabetes");
    expect(summary.medications.map((m) => m.name)).toContain("Amlodipine");
  });

  it("reports the record's last update the same way with or without a profile", () => {
    const before = lastRecordUpdate(amina, NOW.getTime());
    buildContextProfile({ bundle: amina, ctx: asthma, now: NOW });
    expect(lastRecordUpdate(amina, NOW.getTime())).toBe(before);
  });
});

/* ------------------------------------------ the one-page clinical summary -- */

describe("the clinical summary can lead with the focus", () => {
  it("adds the focus section without disturbing the rest", () => {
    const plain = buildClinicalSummary(amina);
    const withFocus = buildClinicalSummary(amina, {
      label: "Asthma",
      highlights: [{ title: "Salbutamol inhaler", meta: "100 mcg · As needed" }],
      others: 12,
    });
    expect(withFocus).toContain("In focus right now");
    expect(withFocus).toContain("Asthma");
    expect(withFocus).toContain("Salbutamol inhaler");
    expect(withFocus).toContain("12 more records remain on the full record");
    expect(withFocus).toContain("Active problems");
    expect(plain).not.toContain("In focus right now");
  });

  it("escapes the focus's own text like every other field", () => {
    const html = buildClinicalSummary(amina, {
      label: "<script>",
      highlights: [],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

