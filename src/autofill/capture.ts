import type { Application } from "../models/types";
import type { NewApplication } from "../data/applicationRepo";

export function captureApplication(
  input: { company: string; position: string; jobUrl: string; atsType: string },
  existing: Application[],
  today: string,
): NewApplication | null {
  const dup = existing.some((a) => {
    if (input.jobUrl && a.jobUrl === input.jobUrl) return true;
    return (
      a.company.toLowerCase() === input.company.toLowerCase() &&
      a.position.toLowerCase() === input.position.toLowerCase()
    );
  });
  if (dup) return null;

  return {
    company: input.company,
    position: input.position,
    location: { type: "onsite", place: "" },
    jobUrl: input.jobUrl,
    atsType: input.atsType,
    appliedDate: today,
    status: "applied",
    linkedEmails: [],
    recruiterContacts: [],
    notes: "",
  };
}
