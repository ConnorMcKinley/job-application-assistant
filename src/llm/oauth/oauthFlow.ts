import { OAUTH } from "./constants";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export function buildAuthorizeUrl(args: { challenge: string; state: string }): string {
  const url = new URL(OAUTH.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", OAUTH.clientId);
  url.searchParams.set("redirect_uri", OAUTH.redirectUri);
  url.searchParams.set("scope", OAUTH.scopes);
  url.searchParams.set("code_challenge", args.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", args.state);
  return url.toString();
}

export function parseCallbackCode(pasted: string): { code: string; state: string } {
  const trimmed = pasted.trim();
  const hash = trimmed.indexOf("#");
  if (hash === -1) return { code: trimmed, state: "" };
  return { code: trimmed.slice(0, hash), state: trimmed.slice(hash + 1) };
}

function toTokens(data: TokenResponse): OAuthTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function exchangeCode(args: {
  code: string;
  state: string;
  verifier: string;
  fetchFn?: typeof fetch;
}): Promise<OAuthTokens> {
  const fetchFn = args.fetchFn ?? fetch;
  const res = await fetchFn(OAUTH.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: args.code,
      state: args.state,
      client_id: OAUTH.clientId,
      redirect_uri: OAUTH.redirectUri,
      code_verifier: args.verifier,
    }),
  });
  if (!res.ok) throw new Error(`OAuth token exchange failed: ${res.status}`);
  return toTokens((await res.json()) as TokenResponse);
}

export async function refreshTokens(args: {
  refreshToken: string;
  fetchFn?: typeof fetch;
}): Promise<OAuthTokens> {
  const fetchFn = args.fetchFn ?? fetch;
  const res = await fetchFn(OAUTH.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: args.refreshToken,
      client_id: OAUTH.clientId,
    }),
  });
  if (!res.ok) throw new Error(`OAuth token refresh failed: ${res.status}`);
  return toTokens((await res.json()) as TokenResponse);
}
