import type { Settings } from "../models/types";
import type { LLMClient } from "./LLMClient";
import { ApiKeyLLMClient } from "./apiKeyClient";
import { OAuthLLMClient } from "./oauthClient";
import type { OAuthTokens } from "./oauth/oauthFlow";

export function createLLMClient(
  settings: Settings,
  onTokensRefreshed: (t: OAuthTokens) => void = () => {},
): LLMClient {
  if (settings.llmBackend === "apiKey") {
    return new ApiKeyLLMClient(settings.apiKey);
  }
  return new OAuthLLMClient(
    {
      accessToken: settings.oauthAccessToken,
      refreshToken: settings.oauthRefreshToken,
      expiresAt: settings.oauthExpiresAt,
    },
    fetch,
    onTokensRefreshed,
  );
}
