import { describe, it, expect, vi } from "vitest";
import { OAuthLLMClient } from "./oauthClient";
import { OAUTH } from "./oauth/constants";

function okMessages(text: string) {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 });
}
function tokenResponse(access: string) {
  return new Response(JSON.stringify({ access_token: access, refresh_token: "R2", expires_in: 3600 }), { status: 200 });
}
const future = () => Date.now() + 3_600_000;

describe("OAuthLLMClient", () => {
  it("sends x-api-key + impersonation headers and a Claude-Code system block", async () => {
    const fetchFn = vi.fn(async () => okMessages("ok"));
    const client = new OAuthLLMClient(
      { accessToken: "sk-ant-oat01-A", refreshToken: "R", expiresAt: future() },
      fetchFn as unknown as typeof fetch,
    );
    const out = await client.complete([{ role: "user", content: "hi" }], { system: "be brief" });
    expect(out).toBe("ok");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(OAUTH.messagesUrl);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-oat01-A");
    expect(headers.authorization).toBeUndefined();
    expect(headers["anthropic-beta"]).toBe(OAUTH.betaHeader);
    expect(headers["x-app"]).toBe(OAUTH.xApp);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.system[0]).toEqual({ type: "text", text: OAUTH.claudeCodeSystem });
    expect(body.system[1]).toEqual({ type: "text", text: "be brief" });
  });

  it("refreshes on 401, retries once, and persists new tokens", async () => {
    const onRefreshed = vi.fn();
    const fetchFn = vi.fn(async (url: string) => {
      if (url === OAUTH.tokenUrl) return tokenResponse("sk-ant-oat01-NEW");
      // first messages call 401, second 200
      return (fetchFn.mock.calls.filter((c) => c[0] === OAUTH.messagesUrl).length === 1)
        ? new Response("nope", { status: 401 })
        : okMessages("after-refresh");
    });
    const client = new OAuthLLMClient(
      { accessToken: "OLD", refreshToken: "R", expiresAt: future() },
      fetchFn as unknown as typeof fetch,
      onRefreshed,
    );
    const out = await client.complete([{ role: "user", content: "hi" }]);
    expect(out).toBe("after-refresh");
    expect(onRefreshed).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "sk-ant-oat01-NEW" }));
    const lastMessages = fetchFn.mock.calls.filter((c) => c[0] === OAUTH.messagesUrl).at(-1)!;
    expect(((lastMessages[1] as RequestInit).headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-oat01-NEW");
  });
});
