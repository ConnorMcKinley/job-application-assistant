import { describe, it, expect, vi } from "vitest";
import { buildAuthorizeUrl, parseCallbackCode, exchangeCode, refreshTokens } from "./oauthFlow";
import { OAUTH } from "./constants";

describe("buildAuthorizeUrl", () => {
  it("includes the required PKCE + client params", () => {
    const url = new URL(buildAuthorizeUrl({ challenge: "CHAL", state: "STATE" }));
    expect(url.origin + url.pathname).toBe(OAUTH.authorizeUrl);
    expect(url.searchParams.get("client_id")).toBe(OAUTH.clientId);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe("CHAL");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("STATE");
    expect(url.searchParams.get("redirect_uri")).toBe(OAUTH.redirectUri);
    expect(url.searchParams.get("scope")).toBe(OAUTH.scopes);
  });
});

describe("parseCallbackCode", () => {
  it("splits code#state", () => {
    expect(parseCallbackCode(" abc#xyz ")).toEqual({ code: "abc", state: "xyz" });
  });
  it("handles a bare code", () => {
    expect(parseCallbackCode("abc")).toEqual({ code: "abc", state: "" });
  });
});

describe("exchangeCode", () => {
  it("posts an authorization_code grant and returns tokens with expiry", async () => {
    const now = Date.now();
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "sk-ant-oat01-A", refresh_token: "R", expires_in: 3600 }), { status: 200 }),
    );
    const tokens = await exchangeCode({ code: "C", state: "S", verifier: "V", fetchFn: mockFetch as unknown as typeof fetch });
    expect(tokens.accessToken).toBe("sk-ant-oat01-A");
    expect(tokens.refreshToken).toBe("R");
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(now + 3600 * 1000);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe(OAUTH.tokenUrl);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.grant_type).toBe("authorization_code");
    expect(body.code).toBe("C");
    expect(body.code_verifier).toBe("V");
    expect(body.client_id).toBe(OAUTH.clientId);
  });

  it("throws on a non-OK response", async () => {
    const mockFetch = vi.fn(async () => new Response("bad", { status: 400 }));
    await expect(exchangeCode({ code: "C", state: "S", verifier: "V", fetchFn: mockFetch as unknown as typeof fetch }))
      .rejects.toThrow(/OAuth token exchange failed: 400/);
  });
});

describe("refreshTokens", () => {
  it("posts a refresh_token grant", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "A2", refresh_token: "R2", expires_in: 3600 }), { status: 200 }),
    );
    const tokens = await refreshTokens({ refreshToken: "R1", fetchFn: mockFetch as unknown as typeof fetch });
    expect(tokens.accessToken).toBe("A2");
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.grant_type).toBe("refresh_token");
    expect(body.refresh_token).toBe("R1");
  });
});
