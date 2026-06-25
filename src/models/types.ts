export type ApplicationStatus =
  | "saved"
  | "applied"
  | "action_needed"
  | "under_review"
  | "interview"
  | "offer"
  | "accepted"
  | "rejected"
  | "withdrawn";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "action_needed",
  "under_review",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

export type LocationType = "onsite" | "remote" | "hybrid";
export const LOCATION_TYPES: LocationType[] = ["onsite", "remote", "hybrid"];

export interface Application {
  id?: number;
  company: string;
  position: string;
  location: { type: LocationType; place: string };
  jobUrl: string;
  atsType: string;
  appliedDate: string; // ISO date (YYYY-MM-DD)
  status: ApplicationStatus;
  linkedEmails: string[];
  recruiterContacts: string[];
  notes: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface EducationEntry {
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface QnAEntry {
  question: string;
  answer: string;
}

export interface Profile {
  id: 1;
  personal: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    linkedin: string;
    github: string;
    portfolio: string;
  };
  education: EducationEntry[];
  experience: ExperienceEntry[];
  workAuth: {
    needsSponsorship: boolean;
    veteranStatus: string;
    disabilityStatus: string;
    demographics: string;
  };
  documents: {
    resumeFileName: string;
    coverLetterTemplate: string;
  };
  preferences: {
    desiredSalary: string;
    desiredLocations: string;
    startDate: string;
    willingToRelocate: boolean;
  };
  qnaBank: QnAEntry[];
}

export interface Settings {
  id: 1;
  llmBackend: "apiKey" | "oauth";
  apiKey: string;
  oauthAccessToken: string;
  oauthRefreshToken: string;
  oauthExpiresAt: number; // epoch ms; 0 when unset
  setupComplete: boolean;
}

export function emptyProfile(): Profile {
  return {
    id: 1,
    personal: { fullName: "", email: "", phone: "", address: "", linkedin: "", github: "", portfolio: "" },
    education: [],
    experience: [],
    workAuth: { needsSponsorship: false, veteranStatus: "", disabilityStatus: "", demographics: "" },
    documents: { resumeFileName: "", coverLetterTemplate: "" },
    preferences: { desiredSalary: "", desiredLocations: "", startDate: "", willingToRelocate: false },
    qnaBank: [],
  };
}

export function defaultSettings(): Settings {
  return {
    id: 1,
    llmBackend: "apiKey",
    apiKey: "",
    oauthAccessToken: "",
    oauthRefreshToken: "",
    oauthExpiresAt: 0,
    setupComplete: false,
  };
}

export interface AtsPattern {
  key: string;
  mappings: Record<string, string>;
}
