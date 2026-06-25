import Dexie, { type EntityTable } from "dexie";
import type { Application, Profile, Settings } from "../models/types";

const database = new Dexie("JobApplicationAssistant") as Dexie & {
  applications: EntityTable<Application, "id">;
  profile: EntityTable<Profile, "id">;
  settings: EntityTable<Settings, "id">;
};

database.version(1).stores({
  applications: "++id, company, status, appliedDate",
  profile: "id",
  settings: "id",
});

export const db = database;
