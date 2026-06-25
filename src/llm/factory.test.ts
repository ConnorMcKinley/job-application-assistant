import { describe, it, expect } from "vitest";
import { createLLMClient } from "./factory";
import { ApiKeyLLMClient } from "./apiKeyClient";
import { defaultSettings } from "../models/types";

describe("createLLMClient", () => {
  it("returns an ApiKeyLLMClient for the apiKey backend", () => {
    const client = createLLMClient({ ...defaultSettings(), apiKey: "sk-x" });
    expect(client).toBeInstanceOf(ApiKeyLLMClient);
  });

  it("throws for the oauth backend in Slice 1", () => {
    expect(() => createLLMClient({ ...defaultSettings(), llmBackend: "oauth" })).toThrow(
      /OAuth backend not implemented/,
    );
  });
});
