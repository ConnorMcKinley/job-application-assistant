import Dexie, { type EntityTable } from "dexie";
import type { Application, Profile, Settings, AtsPattern } from "../models/types";

const database = new Dexie("JobApplicationAssistant") as Dexie & {
  applications: EntityTable<Application, "id">;
  profile: EntityTable<Profile, "id">;
  settings: EntityTable<Settings, "id">;
  atsPatterns: EntityTable<AtsPattern, "key">;
};

database.version(1).stores({
  applications: "++id, company, status, appliedDate",
  profile: "id",
  settings: "id",
});

database.version(2).stores({
  atsPatterns: "key",
});

export const db = database;
