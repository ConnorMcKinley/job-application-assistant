import { describe, it, expect } from "vitest";
import { captureApplication } from "./capture";
import type { Application } from "../models/types";

function app(over: Partial<Application>): Application {
  return { id: 1, company: "Acme", position: "SWE", location: { type: "remote", place: "" },
    jobUrl: "https://acme.test/job", atsType: "greenhouse", appliedDate: "2026-01-01",
    status: "applied", linkedEmails: [], recruiterContacts: [], notes: "",
    createdAt: "", updatedAt: "", ...over };
}

describe("captureApplication", () => {
  it("builds a NewApplication for a fresh submission", () => {
    const result = captureApplication(
      { company: "Beta", position: "PM", jobUrl: "https://beta.test/j", atsType: "lever" },
      [], "2026-06-25",
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe("applied");
    expect(result!.appliedDate).toBe("2026-06-25");
    expect("id" in result!).toBe(false);
  });

  it("returns null on a duplicate jobUrl", () => {
    const result = captureApplication(
      { company: "X", position: "Y", jobUrl: "https://acme.test/job", atsType: "greenhouse" },
      [app({})], "2026-06-25",
    );
    expect(result).toBeNull();
  });

  it("returns null on a duplicate company+position (case-insensitive)", () => {
    const result = captureApplication(
      { company: "acme", position: "swe", jobUrl: "", atsType: "greenhouse" },
      [app({})], "2026-06-25",
    );
    expect(result).toBeNull();
  });
});
