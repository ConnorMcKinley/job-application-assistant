import { describe, it, expect } from "vitest";
import { detectAtsType } from "./atsDetect";

describe("detectAtsType", () => {
  it.each([
    ["boards.greenhouse.io", "greenhouse"],
    ["jobs.lever.co", "lever"],
    ["jobs.ashbyhq.com", "ashby"],
    ["acme.wd1.myworkdayjobs.com", "workday"],
    ["careers.acme.com", "generic"],
  ])("maps %s to %s", (host, expected) => {
    expect(detectAtsType(host)).toBe(expected);
  });
});
