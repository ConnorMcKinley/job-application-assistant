import type { LLMClient, LLMCompleteOptions, LLMMessage } from "./LLMClient";
import { buildMessagesWithImages, concatTextBlocks, type AnthropicContentBlock } from "./anthropicBody";
import { OAUTH } from "./oauth/constants";
import { refreshTokens, type OAuthTokens } from "./oauth/oauthFlow";

const REFRESH_SKEW_MS = 60_000;

export class OAuthLLMClient implements LLMClient {
  constructor(
    private tokens: OAuthTokens,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly onTokensRefreshed: (t: OAuthTokens) => void = () => {},
  ) {}

  private async doRefresh(): Promise<void> {
    this.tokens = await refreshTokens({ refreshToken: this.tokens.refreshToken, fetchFn: this.fetchFn });
    this.onTokensRefreshed(this.tokens);
  }

  private post(messages: LLMMessage[], opts: LLMCompleteOptions): Promise<Response> {
    const system = [
      { type: "text", text: OAUTH.claudeCodeSystem },
      ...(opts.system ? [{ type: "text", text: opts.system }] : []),
    ];
    return this.fetchFn(OAUTH.messagesUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.tokens.accessToken,
        "anthropic-version": OAUTH.anthropicVersion,
        "anthropic-beta": OAUTH.betaHeader,
        "user-agent": OAUTH.userAgent,
        "x-app": OAUTH.xApp,
      },
      body: JSON.stringify({
        model: OAUTH.model,
        max_tokens: opts.maxTokens ?? 1024,
        system,
        messages: buildMessagesWithImages(messages, opts.images),
      }),
    });
  }

  async complete(messages: LLMMessage[], opts: LLMCompleteOptions = {}): Promise<string> {
    if (this.tokens.refreshToken && Date.now() >= this.tokens.expiresAt - REFRESH_SKEW_MS) {
      await this.doRefresh();
    }
    let res = await this.post(messages, opts);
    if (res.status === 401 && this.tokens.refreshToken) {
      await this.doRefresh();
      res = await this.post(messages, opts);
    }
    if (!res.ok) {
      throw new Error(`Anthropic OAuth API error: ${res.status} (you may need to reconnect)`);
    }
    const data = (await res.json()) as { content: AnthropicContentBlock[] };
    return concatTextBlocks(data.content);
  }
}
