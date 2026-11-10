import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain function (not vi.fn) so a rejected request is only seen by the code under test.
let respond: () => Promise<unknown> = async () => ({});
const post = {
  mockResolvedValue: (v: unknown) => (respond = async () => v),
  mockFailure: () =>
    (respond = async () => {
      throw new Error("network");
    }),
};
vi.mock("./api", () => ({
  api: { post: () => respond() },
  buildFormData: (d: Record<string, unknown>) => d,
}));

import {
  DocumentCheckCancelled,
  checkUrlFor,
  confirmAgainstDocument,
  registerDocumentCheckHost,
  type DocumentCheckDecision,
} from "./documentCheck";

const file = new File(["%PDF"], "rx.pdf", { type: "application/pdf" });
const mismatch = {
  field: "dosage",
  form: "500mg",
  document: "600 mg",
  suggestion: "600 mg",
  apply: { dosage: "600 mg" },
  detail: "You entered 500 mg but the document says 600 mg.",
};

function host(decision: DocumentCheckDecision) {
  const confirm = vi.fn(async () => decision);
  const unregister = registerDocumentCheckHost({ begin: () => () => {}, confirm });
  return { confirm, unregister };
}

describe("checkUrlFor", () => {
  it("adds check-document to a list or a detail URL", () => {
    expect(checkUrlFor("/v1/records/medications/")).toBe("/v1/records/medications/check-document/");
    expect(checkUrlFor("/v1/records/vitals/abc/")).toBe("/v1/records/vitals/abc/check-document/");
  });
});

describe("confirmAgainstDocument", () => {
  beforeEach(() => post.mockResolvedValue({}));

  it("applies the document value the person chose", async () => {
    post.mockResolvedValue({ data: { status: "DONE", mismatches: [mismatch], summary: "Prescription." } });
    const { confirm, unregister } = host({ action: "save", apply: { dosage: "600 mg" } });
    const out = await confirmAgainstDocument("/v1/records/medications/", { name: "Paracetamol", dosage: "500mg" }, file);
    expect(confirm).toHaveBeenCalledOnce();
    expect(out).toEqual({ name: "Paracetamol", dosage: "600 mg" });
    unregister();
  });

  it("stops the save when the person goes back to edit", async () => {
    post.mockResolvedValue({ data: { status: "DONE", mismatches: [mismatch], summary: "" } });
    const { unregister } = host({ action: "cancel" });
    await expect(confirmAgainstDocument("/v1/records/medications/", {}, file)).rejects.toBeInstanceOf(
      DocumentCheckCancelled,
    );
    unregister();
  });

  it("does not ask when the document agrees", async () => {
    post.mockResolvedValue({ data: { status: "DONE", mismatches: [], summary: "" } });
    const { confirm, unregister } = host({ action: "cancel" });
    expect(await confirmAgainstDocument("/v1/records/allergies/", { substance: "x" }, file)).toEqual({ substance: "x" });
    expect(confirm).not.toHaveBeenCalled();
    unregister();
  });

  it("never blocks saving when the check fails", async () => {
    post.mockFailure();
    const { unregister } = host({ action: "cancel" });
    const out = await confirmAgainstDocument("/v1/records/allergies/", { substance: "x" }, file).catch((e) => e);
    expect(out).toEqual({ substance: "x" });
    unregister();
  });
});
