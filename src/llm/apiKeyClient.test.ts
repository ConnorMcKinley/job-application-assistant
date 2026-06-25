import { describe, it, expect, vi } from "vitest";
import { ApiKeyLLMClient } from "./apiKeyClient";

describe("ApiKeyLLMClient", () => {
  it("posts to the Anthropic API and returns concatenated text", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "Hello" }, { type: "text", text: " world" }] }),
        { status: 200 },
      ),
    );
    const client = new ApiKeyLLMClient("sk-test", mockFetch as unknown as typeof fetch);

    const out = await client.complete([{ role: "user", content: "hi" }], { system: "be brief" });

    expect(out).toBe("Hello world");
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.system).toBe("be brief");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("throws on a non-OK response", async () => {
    const mockFetch = vi.fn(async () => new Response("nope", { status: 401 }));
    const client = new ApiKeyLLMClient("sk-bad", mockFetch as unknown as typeof fetch);
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toThrow(/401/);
  });

  it("attaches images as blocks on the last user message", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 }),
    );
    const client = new ApiKeyLLMClient("sk-test", mockFetch as unknown as typeof fetch);
    await client.complete([{ role: "user", content: "look" }], { images: ["BASE64DATA"] });
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    const last = body.messages[body.messages.length - 1];
    expect(Array.isArray(last.content)).toBe(true);
    expect(last.content[0]).toEqual({ type: "text", text: "look" });
    expect(last.content[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "BASE64DATA" },
    });
  });
});
