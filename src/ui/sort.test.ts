import { describe, it, expect } from "vitest";
import { sortApplications } from "./sort";
import type { Application } from "../models/types";

function app(over: Partial<Application>): Application {
  return {
    id: 1, company: "", position: "", location: { type: "remote", place: "" },
    jobUrl: "", atsType: "", appliedDate: "2026-01-01", status: "applied",
    linkedEmails: [], recruiterContacts: [], notes: "",
    createdAt: "", updatedAt: "", ...over,
  };
}

describe("sortApplications", () => {
  it("sorts by company ascending, case-insensitive", () => {
    const out = sortApplications(
      [app({ company: "zeta" }), app({ company: "Alpha" })],
      "company",
      "asc",
    );
    expect(out.map((a) => a.company)).toEqual(["Alpha", "zeta"]);
  });

  it("sorts by appliedDate descending", () => {
    const out = sortApplications(
      [app({ appliedDate: "2026-01-01" }), app({ appliedDate: "2026-06-01" })],
      "appliedDate",
      "desc",
    );
    expect(out.map((a) => a.appliedDate)).toEqual(["2026-06-01", "2026-01-01"]);
  });

  it("does not mutate the input array", () => {
    const input = [app({ company: "b" }), app({ company: "a" })];
    sortApplications(input, "company", "asc");
    expect(input.map((a) => a.company)).toEqual(["b", "a"]);
  });
});
