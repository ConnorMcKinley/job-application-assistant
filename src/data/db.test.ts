import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";

describe("db", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("exposes the three tables", () => {
    expect(db.applications).toBeDefined();
    expect(db.profile).toBeDefined();
    expect(db.settings).toBeDefined();
  });

  it("auto-increments application ids", async () => {
    const id = await db.applications.add({
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
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    });
    expect(typeof id).toBe("number");
  });
});
