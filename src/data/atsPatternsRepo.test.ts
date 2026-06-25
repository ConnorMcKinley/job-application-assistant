import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { getPattern, mergePattern } from "./atsPatternsRepo";

describe("atsPatternsRepo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("returns undefined for an unknown key", async () => {
    expect(await getPattern("greenhouse")).toBeUndefined();
  });

  it("merges mappings across calls", async () => {
    await mergePattern("greenhouse", { "Full name": "fullName" });
    await mergePattern("greenhouse", { "Email": "email" });
    const p = await getPattern("greenhouse");
    expect(p!.mappings).toEqual({ "Full name": "fullName", "Email": "email" });
  });
});
