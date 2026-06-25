import { db } from "./db";
import { emptyProfile, type Profile } from "../models/types";

export async function getProfile(): Promise<Profile> {
  const stored = await db.profile.get(1);
  return stored ?? emptyProfile();
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put({ ...profile, id: 1 });
}
