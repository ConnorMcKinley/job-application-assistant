import { describe, it, expect } from "vitest";
import { createVerifier, challengeFromVerifier } from "./pkce";

const B64URL = /^[A-Za-z0-9\-_]+$/;

describe("pkce", () => {
  it("creates a base64url verifier of length 43", () => {
    const v = createVerifier();
    expect(v).toMatch(B64URL);
    expect(v.length).toBe(43);
  });

  it("creates unique verifiers", () => {
    expect(createVerifier()).not.toBe(createVerifier());
  });

  it("derives a deterministic base64url S256 challenge of length 43", async () => {
    const c1 = await challengeFromVerifier("test-verifier");
    const c2 = await challengeFromVerifier("test-verifier");
    expect(c1).toBe(c2);
    expect(c1).toMatch(B64URL);
    expect(c1.length).toBe(43);
    expect(await challengeFromVerifier("other")).not.toBe(c1);
  });
});
