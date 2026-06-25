import { db } from "./db";
import type { Application } from "../models/types";

export type NewApplication = Omit<Application, "id" | "createdAt" | "updatedAt">;

export async function createApplication(input: NewApplication): Promise<number> {
  const now = new Date().toISOString();
  return db.applications.add({ ...input, createdAt: now, updatedAt: now });
}

export async function listApplications(): Promise<Application[]> {
  return db.applications.toArray();
}

export async function getApplication(id: number): Promise<Application | undefined> {
  return db.applications.get(id);
}

export async function updateApplication(
  id: number,
  changes: Partial<NewApplication>,
): Promise<void> {
  await db.applications.update(id, { ...changes, updatedAt: new Date().toISOString() });
}

export async function deleteApplication(id: number): Promise<void> {
  await db.applications.delete(id);
}
