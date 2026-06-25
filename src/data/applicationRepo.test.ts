import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import {
  createApplication,
  listApplications,
  getApplication,
  updateApplication,
  deleteApplication,
  type NewApplication,
} from "./applicationRepo";

const sample: NewApplication = {
  company: "Acme",
  position: "SWE",
  location: { type: "remote", place: "" },
  jobUrl: "https://acme.test/job",
  atsType: "greenhouse",
  appliedDate: "2026-06-25",
  status: "applied",
  linkedEmails: [],
  recruiterContacts: [],
  notes: "",
};

describe("applicationRepo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates and lists applications", async () => {
    const id = await createApplication(sample);
    const all = await listApplications();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(id);
    expect(all[0]!.company).toBe("Acme");
    expect(all[0]!.createdAt).not.toBe("");
  });

  it("updates an application and re-stamps updatedAt", async () => {
    const id = await createApplication(sample);
    const before = await getApplication(id);
    await new Promise((r) => setTimeout(r, 2));
    await updateApplication(id, { status: "interview" });
    const after = await getApplication(id);
    expect(after!.status).toBe("interview");
    expect(after!.updatedAt).not.toBe(before!.updatedAt);
  });

  it("deletes an application", async () => {
    const id = await createApplication(sample);
    await deleteApplication(id);
    expect(await getApplication(id)).toBeUndefined();
  });
});
