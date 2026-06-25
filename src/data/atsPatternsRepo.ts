import { db } from "./db";
import type { AtsPattern } from "../models/types";

export async function getPattern(key: string): Promise<AtsPattern | undefined> {
  return db.atsPatterns.get(key);
}

export async function mergePattern(
  key: string,
  mappings: Record<string, string>,
): Promise<void> {
  const existing = await db.atsPatterns.get(key);
  const merged = { ...(existing?.mappings ?? {}), ...mappings };
  await db.atsPatterns.put({ key, mappings: merged });
}
