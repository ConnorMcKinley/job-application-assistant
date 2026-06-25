import type { LLMMessage } from "./LLMClient";

export type ApiMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "user" | "assistant"; content: Array<Record<string, unknown>> };

export interface AnthropicContentBlock {
  type: string;
  text?: string;
}

export function buildMessagesWithImages(messages: LLMMessage[], images?: string[]): ApiMessage[] {
  if (!images || images.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (!last) return messages;
  const out: ApiMessage[] = messages.slice(0, -1);
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

export function concatTextBlocks(content: AnthropicContentBlock[]): string {
  return content
    .filter((b): b is AnthropicContentBlock & { text: string } =>
      b.type === "text" && typeof b.text === "string",
    )
    .map((b) => b.text)
    .join("");
}
