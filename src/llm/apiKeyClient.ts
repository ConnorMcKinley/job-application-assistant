import type { LLMClient, LLMCompleteOptions, LLMMessage } from "./LLMClient";
import { buildMessagesWithImages, concatTextBlocks, type AnthropicContentBlock } from "./anthropicBody";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export class ApiKeyLLMClient implements LLMClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async complete(messages: LLMMessage[], opts: LLMCompleteOptions = {}): Promise<string> {
    const res = await this.fetchFn(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.system ? { system: opts.system } : {}),
        messages: buildMessagesWithImages(messages, opts.images),
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status}`);
    }

    const data = (await res.json()) as { content: AnthropicContentBlock[] };
    return concatTextBlocks(data.content);
  }
}
