import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { getProfile, saveProfile } from "./profileRepo";
import { emptyProfile } from "../models/types";

describe("profileRepo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("returns an empty profile when none stored", async () => {
    const p = await getProfile();
    expect(p.id).toBe(1);
    expect(p.personal.fullName).toBe("");
  });

  it("saves and reloads a profile", async () => {
    const p = emptyProfile();
    p.personal.fullName = "Connor McKinley";
    await saveProfile(p);
    const loaded = await getProfile();
    expect(loaded.personal.fullName).toBe("Connor McKinley");
  });
});
