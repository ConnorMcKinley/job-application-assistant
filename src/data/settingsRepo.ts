import { db } from "./db";
import { defaultSettings, type Settings } from "../models/types";

export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get(1);
  return stored ?? defaultSettings();
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put({ ...settings, id: 1 });
}

export async function markSetupComplete(): Promise<void> {
  const current = await getSettings();
  await saveSettings({ ...current, setupComplete: true });
}
