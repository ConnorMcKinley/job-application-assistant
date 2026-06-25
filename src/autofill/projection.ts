import type { Profile } from "../models/types";

export function buildProfileProjection(profile: Profile): Record<string, string> {
  const edu = profile.education[0];
  const exp = profile.experience[0];
  const candidates: Record<string, string> = {
    fullName: profile.personal.fullName,
    email: profile.personal.email,
    phone: profile.personal.phone,
    address: profile.personal.address,
    linkedin: profile.personal.linkedin,
    github: profile.personal.github,
    portfolio: profile.personal.portfolio,
    school: edu?.school ?? "",
    degree: edu?.degree ?? "",
    fieldOfStudy: edu?.field ?? "",
    mostRecentCompany: exp?.company ?? "",
    mostRecentTitle: exp?.title ?? "",
    desiredSalary: profile.preferences.desiredSalary,
    desiredLocations: profile.preferences.desiredLocations,
    startDate: profile.preferences.startDate,
    willingToRelocate: profile.preferences.willingToRelocate ? "yes" : "",
    needsSponsorship: profile.workAuth.needsSponsorship ? "yes" : "",
  };

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(candidates)) {
    if (v !== "") out[k] = v;
  }
  return out;
}
