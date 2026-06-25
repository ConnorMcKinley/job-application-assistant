import type { LLMClient, LLMCompleteOptions, LLMMessage } from "./LLMClient";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

type ApiMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "user" | "assistant"; content: Array<Record<string, unknown>> };

function buildMessages(messages: LLMMessage[], images?: string[]): ApiMessage[] {
  if (!images || images.length === 0) return messages;
  const out: ApiMessage[] = messages.slice(0, -1);
  const last = messages[messages.length - 1];
  if (!last) return messages;
  out.push({
    role: last.role,
    content: [
      { type: "text", text: last.content },
      ...images.map((data) => ({
        type: "image",
        source: { type: "base64", media_type: "image/png", data },
      })),
    ],
  });
  return out;
}

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
        messages: buildMessages(messages, opts.images),
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status}`);
    }

    const data = (await res.json()) as { content: AnthropicContentBlock[] };
    return data.content
      .filter((b): b is AnthropicContentBlock & { text: string } =>
        b.type === "text" && typeof b.text === "string",
      )
      .map((b) => b.text)
      .join("");
  }
}
