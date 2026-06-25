import { describe, it, expect } from "vitest";
import { createLLMClient } from "./factory";
import { ApiKeyLLMClient } from "./apiKeyClient";
import { OAuthLLMClient } from "./oauthClient";
import { defaultSettings } from "../models/types";

describe("createLLMClient", () => {
  it("returns an ApiKeyLLMClient for the apiKey backend", () => {
    const client = createLLMClient({ ...defaultSettings(), apiKey: "sk-x" });
    expect(client).toBeInstanceOf(ApiKeyLLMClient);
  });

  it("returns an OAuthLLMClient for the oauth backend", () => {
    const client = createLLMClient({ ...defaultSettings(), llmBackend: "oauth", oauthAccessToken: "sk-ant-oat01-x" });
    expect(client).toBeInstanceOf(OAuthLLMClient);
  });
});
