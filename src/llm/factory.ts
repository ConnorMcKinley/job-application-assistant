import type { Settings } from "../models/types";
import type { LLMClient } from "./LLMClient";
import { ApiKeyLLMClient } from "./apiKeyClient";

export function createLLMClient(settings: Settings): LLMClient {
  if (settings.llmBackend === "apiKey") {
    return new ApiKeyLLMClient(settings.apiKey);
  }
  throw new Error("OAuth backend not implemented in Slice 1");
}
