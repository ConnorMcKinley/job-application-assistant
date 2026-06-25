# LLM Auth & Settings (OAuth-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user configure LLM auth in a Settings UI — entering an API key, or connecting their Claude subscription via OAuth (manual code-paste) — so the auto-fill engine can run without a paid API key.

**Architecture:** All auth lives behind the existing `LLMClient` factory seam. A new isolated `src/llm/oauth/` module (PKCE + flow + constants, all pure) plus an `OAuthLLMClient` that sends the OAuth token as `x-api-key` with Claude-Code impersonation headers and a prepended Claude-Code system block, refreshing on 401. A new `SettingsView` collects credentials; a dashboard gate blocks until one method is configured.

**Tech Stack:** WXT (MV3), React 18, TypeScript strict, Dexie 4, Vitest + jsdom + Testing Library, Web Crypto (PKCE). Builds on Slices 1–2.

## Global Constraints

- WXT MV3; TS strict + `noUncheckedIndexedAccess`; no `any` in app code. React 18 hooks only. Run `pnpm` from inside `job-application-assistant/`.
- OAuth token transport: **`x-api-key`** (NOT `Authorization: Bearer`).
- OAuth impersonation headers, verbatim: `anthropic-beta: claude-code-20250219,oauth-2025-04-20`, `user-agent: claude-cli/1.0`, `x-app: cli`, `anthropic-version: 2023-06-01`.
- OAuth system prepend, verbatim first block text: `You are Claude Code, Anthropic's official CLI for Claude.`
- OAuth client_id: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`; redirect_uri: `https://console.anthropic.com/oauth/code/callback`; authorize host `https://claude.ai/oauth/authorize`; token endpoint `https://console.anthropic.com/v1/oauth/token`; scopes `org:create_api_key user:profile user:inference`. (Marked "verify during manual run" — these are reverse-engineered and may drift.)
- Model id: `claude-sonnet-4-6`.
- Each code change is committed at the end of its task.

---

## File Structure

```
src/
  models/types.ts            # MODIFY: Settings gains oauth token fields; defaultSettings (Task 1)
  data/settingsRepo.ts       # MODIFY: isLlmConfigured() helper (Task 1)
  llm/
    anthropicBody.ts         # NEW: shared message/image body + text-concat helpers (Task 4)
    apiKeyClient.ts          # MODIFY: use anthropicBody helpers (Task 4)
    oauthClient.ts           # NEW: OAuthLLMClient (Task 5)
    factory.ts               # MODIFY: wire "oauth" → OAuthLLMClient (Task 5)
    oauth/
      constants.ts           # NEW: client_id, endpoints, headers, model (Task 3)
      pkce.ts                # NEW: createVerifier / challengeFromVerifier (Task 2)
      oauthFlow.ts           # NEW: authorize URL, code parse, exchange, refresh; OAuthTokens (Task 3)
  ui/components/
    SettingsView.tsx         # NEW: presentational auth UI (Task 6)
    SettingsView.test.tsx
    SettingsContainer.tsx    # NEW: glue handlers (PKCE/connect/exchange/save/test) (Task 7)
    Dashboard.tsx            # MODIFY: Settings route + auth-gate banner (Task 7)
entrypoints/
  background.ts              # MODIFY: pass onTokensRefreshed to createLLMClient (Task 7)
wxt.config.ts                # MODIFY: host_permissions (Task 7)
```

---

### Task 1: Settings token fields + `isLlmConfigured`

**Files:**
- Modify: `src/models/types.ts`
- Modify: `src/data/settingsRepo.ts`
- Test: `src/data/settingsRepo.test.ts` (add cases)

**Interfaces:**
- Consumes: `Settings`, `defaultSettings` (Slice 1).
- Produces:
  - `Settings` gains `oauthAccessToken: string`, `oauthRefreshToken: string`, `oauthExpiresAt: number` (epoch ms; `0` when unset).
  - `isLlmConfigured(settings: Settings): boolean` — `true` when `llmBackend==="apiKey" && apiKey!==""`, or `llmBackend==="oauth" && oauthAccessToken!==""`.

- [ ] **Step 1: Update `Settings` + `defaultSettings` in `src/models/types.ts`**

Replace the `Settings` interface and `defaultSettings` function with:

```typescript
export interface Settings {
  id: 1;
  llmBackend: "apiKey" | "oauth";
  apiKey: string;
  oauthAccessToken: string;
  oauthRefreshToken: string;
  oauthExpiresAt: number; // epoch ms; 0 when unset
  setupComplete: boolean;
}

export function defaultSettings(): Settings {
  return {
    id: 1,
    llmBackend: "apiKey",
    apiKey: "",
    oauthAccessToken: "",
    oauthRefreshToken: "",
    oauthExpiresAt: 0,
    setupComplete: false,
  };
}
```

- [ ] **Step 2: Write the failing test (add to `src/data/settingsRepo.test.ts`)**

Add these imports/cases (keep existing tests):

```typescript
import { getSettings, saveSettings, markSetupComplete, isLlmConfigured } from "./settingsRepo";
import { defaultSettings } from "../models/types";

describe("isLlmConfigured", () => {
  it("is false on defaults", () => {
    expect(isLlmConfigured(defaultSettings())).toBe(false);
  });
  it("is true with an api key", () => {
    expect(isLlmConfigured({ ...defaultSettings(), llmBackend: "apiKey", apiKey: "sk-x" })).toBe(true);
  });
  it("is true with oauth tokens", () => {
    expect(isLlmConfigured({ ...defaultSettings(), llmBackend: "oauth", oauthAccessToken: "sk-ant-oat01-x" })).toBe(true);
  });
  it("ignores an api key when backend is oauth", () => {
    expect(isLlmConfigured({ ...defaultSettings(), llmBackend: "oauth", apiKey: "sk-x" })).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/data/settingsRepo.test.ts`
Expected: FAIL — `isLlmConfigured` is not exported.

- [ ] **Step 4: Add `isLlmConfigured` to `src/data/settingsRepo.ts`**

Append:

```typescript
export function isLlmConfigured(settings: Settings): boolean {
  if (settings.llmBackend === "apiKey") return settings.apiKey !== "";
  return settings.oauthAccessToken !== "";
}
```

(Ensure `Settings` is imported in the file — it already imports from `../models/types`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/data/settingsRepo.test.ts`
Expected: PASS (existing cases + 4 new). Full suite: `pnpm test` still green.

- [ ] **Step 6: Commit**

```bash
git add job-application-assistant/src/models/types.ts job-application-assistant/src/data/settingsRepo.ts job-application-assistant/src/data/settingsRepo.test.ts
git commit -m "feat: add oauth token fields to settings and isLlmConfigured"
```

---

### Task 2: PKCE

**Files:**
- Create: `src/llm/oauth/pkce.ts`
- Test: `src/llm/oauth/pkce.test.ts`

**Interfaces:**
- Produces:
  - `createVerifier(): string` — 43-char base64url string from 32 random bytes.
  - `challengeFromVerifier(verifier: string): Promise<string>` — base64url of SHA-256(verifier) (43 chars), deterministic.

- [ ] **Step 1: Write the failing test `src/llm/oauth/pkce.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { createVerifier, challengeFromVerifier } from "./pkce";

const B64URL = /^[A-Za-z0-9\-_]+$/;

describe("pkce", () => {
  it("creates a base64url verifier of length 43", () => {
    const v = createVerifier();
    expect(v).toMatch(B64URL);
    expect(v.length).toBe(43);
  });

  it("creates unique verifiers", () => {
    expect(createVerifier()).not.toBe(createVerifier());
  });

  it("derives a deterministic base64url S256 challenge of length 43", async () => {
    const c1 = await challengeFromVerifier("test-verifier");
    const c2 = await challengeFromVerifier("test-verifier");
    expect(c1).toBe(c2);
    expect(c1).toMatch(B64URL);
    expect(c1.length).toBe(43);
    expect(await challengeFromVerifier("other")).not.toBe(c1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/llm/oauth/pkce.test.ts`
Expected: FAIL — cannot resolve `./pkce`.

- [ ] **Step 3: Create `src/llm/oauth/pkce.ts`**

```typescript
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function challengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/llm/oauth/pkce.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/llm/oauth/pkce.ts job-application-assistant/src/llm/oauth/pkce.test.ts
git commit -m "feat: add PKCE verifier/challenge for OAuth"
```

---

### Task 3: OAuth constants + flow

**Files:**
- Create: `src/llm/oauth/constants.ts`
- Create: `src/llm/oauth/oauthFlow.ts`
- Test: `src/llm/oauth/oauthFlow.test.ts`

**Interfaces:**
- Consumes: `constants.ts`.
- Produces:
  - `OAuthTokens { accessToken: string; refreshToken: string; expiresAt: number }`.
  - `buildAuthorizeUrl(args: { challenge: string; state: string }): string`.
  - `parseCallbackCode(pasted: string): { code: string; state: string }` — splits on `#`; `state` is `""` when absent; trims.
  - `exchangeCode(args: { code: string; state: string; verifier: string; fetchFn?: typeof fetch }): Promise<OAuthTokens>`.
  - `refreshTokens(args: { refreshToken: string; fetchFn?: typeof fetch }): Promise<OAuthTokens>`.

- [ ] **Step 1: Create `src/llm/oauth/constants.ts`**

```typescript
export const OAUTH = {
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  authorizeUrl: "https://claude.ai/oauth/authorize",
  tokenUrl: "https://console.anthropic.com/v1/oauth/token",
  redirectUri: "https://console.anthropic.com/oauth/code/callback",
  scopes: "org:create_api_key user:profile user:inference",
  betaHeader: "claude-code-20250219,oauth-2025-04-20",
  userAgent: "claude-cli/1.0",
  xApp: "cli",
  anthropicVersion: "2023-06-01",
  model: "claude-sonnet-4-6",
  claudeCodeSystem: "You are Claude Code, Anthropic's official CLI for Claude.",
  messagesUrl: "https://api.anthropic.com/v1/messages",
} as const;
```

- [ ] **Step 2: Write the failing test `src/llm/oauth/oauthFlow.test.ts`**

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/llm/oauth/oauthFlow.test.ts`
Expected: FAIL — cannot resolve `./oauthFlow`.

- [ ] **Step 4: Create `src/llm/oauth/oauthFlow.ts`**

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/llm/oauth/oauthFlow.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add job-application-assistant/src/llm/oauth/constants.ts job-application-assistant/src/llm/oauth/oauthFlow.ts job-application-assistant/src/llm/oauth/oauthFlow.test.ts
git commit -m "feat: add OAuth constants and authorize/exchange/refresh flow"
```

---

### Task 4: Shared Anthropic body helpers + apiKeyClient refactor

**Files:**
- Create: `src/llm/anthropicBody.ts`
- Test: `src/llm/anthropicBody.test.ts`
- Modify: `src/llm/apiKeyClient.ts`

**Interfaces:**
- Consumes: `LLMMessage` (Slice 1).
- Produces:
  - `ApiMessage` type (string-content or block-array-content message).
  - `buildMessagesWithImages(messages: LLMMessage[], images?: string[]): ApiMessage[]` — when images present, the **last** message's content becomes `[{type:"text",text}, ...image blocks]`; else messages unchanged.
  - `AnthropicContentBlock { type: string; text?: string }`.
  - `concatTextBlocks(content: AnthropicContentBlock[]): string` — join text-type blocks.
  - `apiKeyClient.ts` uses both helpers (behavior identical; its 3 existing tests still pass).

- [ ] **Step 1: Write the failing test `src/llm/anthropicBody.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildMessagesWithImages, concatTextBlocks } from "./anthropicBody";

describe("buildMessagesWithImages", () => {
  it("leaves messages unchanged with no images", () => {
    const msgs = [{ role: "user" as const, content: "hi" }];
    expect(buildMessagesWithImages(msgs)).toEqual(msgs);
  });
  it("attaches image blocks to the last message", () => {
    const out = buildMessagesWithImages([{ role: "user", content: "look" }], ["B64"]);
    const last = out[out.length - 1]!;
    expect(Array.isArray(last.content)).toBe(true);
    expect((last.content as Array<Record<string, unknown>>)[0]).toEqual({ type: "text", text: "look" });
    expect((last.content as Array<Record<string, unknown>>)[1]).toEqual({
      type: "image", source: { type: "base64", media_type: "image/png", data: "B64" },
    });
  });
});

describe("concatTextBlocks", () => {
  it("joins only text blocks", () => {
    expect(concatTextBlocks([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }])).toBe("ab");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/llm/anthropicBody.test.ts`
Expected: FAIL — cannot resolve `./anthropicBody`.

- [ ] **Step 3: Create `src/llm/anthropicBody.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/llm/anthropicBody.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `src/llm/apiKeyClient.ts` to use the helpers** (full file)

```typescript
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
```

- [ ] **Step 6: Run apiKeyClient tests to confirm unchanged behavior**

Run: `pnpm test src/llm/apiKeyClient.test.ts`
Expected: PASS (3 tests — system prompt + messages, 401 throw, image attach). Full suite `pnpm test` still green.

- [ ] **Step 7: Commit**

```bash
git add job-application-assistant/src/llm/anthropicBody.ts job-application-assistant/src/llm/anthropicBody.test.ts job-application-assistant/src/llm/apiKeyClient.ts
git commit -m "refactor: extract shared Anthropic body helpers; reuse in apiKeyClient"
```

---

### Task 5: `OAuthLLMClient` + factory wiring

**Files:**
- Create: `src/llm/oauthClient.ts`
- Test: `src/llm/oauthClient.test.ts`
- Modify: `src/llm/factory.ts`
- Test: `src/llm/factory.test.ts` (update the oauth case)

**Interfaces:**
- Consumes: `LLMClient`/`LLMMessage`/`LLMCompleteOptions` (Slice 1); `buildMessagesWithImages`/`concatTextBlocks` (Task 4); `OAUTH` (Task 3); `OAuthTokens`/`refreshTokens` (Task 3); `Settings` (Task 1).
- Produces:
  - `OAuthLLMClient implements LLMClient` — constructor `(tokens: OAuthTokens, fetchFn?: typeof fetch, onTokensRefreshed?: (t: OAuthTokens) => void)`. Sends `x-api-key` + impersonation headers; `system` as `[{type:"text",text:OAUTH.claudeCodeSystem}, ...(opts.system ? [{type:"text",text:opts.system}] : [])]`; refreshes proactively (within 60s of expiry) and reactively on 401 (retry once), persisting via `onTokensRefreshed`.
  - `createLLMClient(settings: Settings, onTokensRefreshed?: (t: OAuthTokens) => void): LLMClient` — `"apiKey"` → `ApiKeyLLMClient`; `"oauth"` → `OAuthLLMClient` (no longer throws).

- [ ] **Step 1: Write the failing test `src/llm/oauthClient.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/llm/oauthClient.test.ts`
Expected: FAIL — cannot resolve `./oauthClient`.

- [ ] **Step 3: Create `src/llm/oauthClient.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/llm/oauthClient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Update `src/llm/factory.ts`** (full file)

```typescript
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
```

- [ ] **Step 6: Update the oauth case in `src/llm/factory.test.ts`**

Replace the existing `it("throws for the oauth backend in Slice 1", ...)` test with:

```typescript
import { OAuthLLMClient } from "./oauthClient";

  it("returns an OAuthLLMClient for the oauth backend", () => {
    const client = createLLMClient({ ...defaultSettings(), llmBackend: "oauth", oauthAccessToken: "sk-ant-oat01-x" });
    expect(client).toBeInstanceOf(OAuthLLMClient);
  });
```

- [ ] **Step 7: Run factory + full suite**

Run: `pnpm test src/llm/factory.test.ts`
Expected: PASS (apiKey case + new oauth case).
Run: `pnpm test`
Expected: full suite green.

- [ ] **Step 8: Commit**

```bash
git add job-application-assistant/src/llm/oauthClient.ts job-application-assistant/src/llm/oauthClient.test.ts job-application-assistant/src/llm/factory.ts job-application-assistant/src/llm/factory.test.ts
git commit -m "feat: add OAuthLLMClient and wire it into the factory"
```

---

### Task 6: `SettingsView` (presentational)

**Files:**
- Create: `src/ui/components/SettingsView.tsx`
- Test: `src/ui/components/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `Settings` (Task 1).
- Produces:
  - `AuthStatus = "not_connected" | "connected" | "error"`.
  - `SettingsView` props:
    ```
    {
      settings: Settings;
      status: AuthStatus;
      statusMessage: string;
      onSelectBackend: (b: "apiKey" | "oauth") => void;
      onSaveApiKey: (key: string) => void;
      onTestApiKey: () => void;
      onConnect: () => void;
      onSubmitCode: (pasted: string) => void;
      onDisconnect: () => void;
      onClose: () => void;
    }
    ```
  - Renders: a backend toggle; when `apiKey` — a masked input (seeded from `settings.apiKey`), Save, Test; when `oauth` — Connect button, a paste-code input + Submit, a status line (`statusMessage`), Disconnect (shown when `settings.oauthAccessToken !== ""`). A Close/back button. The "Claude subscription" option is labeled **experimental**.

- [ ] **Step 1: Write the failing test `src/ui/components/SettingsView.test.tsx`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsView } from "./SettingsView";
import { defaultSettings, type Settings } from "../../models/types";

function setup(over: Partial<Settings> = {}, props: Record<string, unknown> = {}) {
  const handlers = {
    onSelectBackend: vi.fn(), onSaveApiKey: vi.fn(), onTestApiKey: vi.fn(),
    onConnect: vi.fn(), onSubmitCode: vi.fn(), onDisconnect: vi.fn(), onClose: vi.fn(),
  };
  render(
    <SettingsView
      settings={{ ...defaultSettings(), ...over }}
      status="not_connected"
      statusMessage=""
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("SettingsView", () => {
  it("saves an entered API key", async () => {
    const h = setup({ llmBackend: "apiKey" });
    await userEvent.type(screen.getByLabelText(/api key/i), "sk-test");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(h.onSaveApiKey).toHaveBeenCalledWith("sk-test");
  });

  it("submits a pasted OAuth code", async () => {
    const h = setup({ llmBackend: "oauth" });
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(h.onConnect).toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/paste/i), "abc#xyz");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(h.onSubmitCode).toHaveBeenCalledWith("abc#xyz");
  });

  it("shows Disconnect only when oauth tokens exist", () => {
    setup({ llmBackend: "oauth", oauthAccessToken: "sk-ant-oat01-x" });
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/ui/components/SettingsView.test.tsx`
Expected: FAIL — cannot resolve `./SettingsView`.

- [ ] **Step 3: Create `src/ui/components/SettingsView.tsx`**

```typescript
import { useState } from "react";
import type { Settings } from "../../models/types";

export type AuthStatus = "not_connected" | "connected" | "error";

interface Props {
  settings: Settings;
  status: AuthStatus;
  statusMessage: string;
  onSelectBackend: (b: "apiKey" | "oauth") => void;
  onSaveApiKey: (key: string) => void;
  onTestApiKey: () => void;
  onConnect: () => void;
  onSubmitCode: (pasted: string) => void;
  onDisconnect: () => void;
  onClose: () => void;
}

export function SettingsView(props: Props) {
  const { settings } = props;
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [pasted, setPasted] = useState("");

  return (
    <div>
      <h1>Settings</h1>
      <button type="button" onClick={props.onClose}>Back</button>

      <fieldset>
        <legend>LLM provider</legend>
        <label>
          <input type="radio" name="backend" checked={settings.llmBackend === "apiKey"}
            onChange={() => props.onSelectBackend("apiKey")} />
          Anthropic API key
        </label>
        <label>
          <input type="radio" name="backend" checked={settings.llmBackend === "oauth"}
            onChange={() => props.onSelectBackend("oauth")} />
          Claude subscription (experimental)
        </label>
      </fieldset>

      {settings.llmBackend === "apiKey" && (
        <div>
          <label>API key
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
          <button type="button" onClick={() => props.onSaveApiKey(apiKey)}>Save</button>
          <button type="button" onClick={props.onTestApiKey}>Test</button>
        </div>
      )}

      {settings.llmBackend === "oauth" && (
        <div>
          <button type="button" onClick={props.onConnect}>Connect Claude subscription</button>
          <label>Paste the code from the callback page
            <input type="text" value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </label>
          <button type="button" onClick={() => props.onSubmitCode(pasted)}>Submit</button>
          {settings.oauthAccessToken !== "" && (
            <button type="button" onClick={props.onDisconnect}>Disconnect</button>
          )}
        </div>
      )}

      {props.statusMessage ? <p role="status">{props.statusMessage}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/ui/components/SettingsView.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/ui/components/SettingsView.tsx job-application-assistant/src/ui/components/SettingsView.test.tsx
git commit -m "feat: add presentational SettingsView"
```

---

### Task 7: Settings wiring + dashboard gate + manifest + background (glue)

**Files:**
- Create: `src/ui/components/SettingsContainer.tsx`
- Modify: `src/ui/components/Dashboard.tsx`
- Test: `src/ui/components/Dashboard.test.tsx` (add a gate/route case)
- Modify: `entrypoints/background.ts`
- Modify: `wxt.config.ts`

**Interfaces:**
- Consumes: `SettingsView`/`AuthStatus` (Task 6); `getSettings`/`saveSettings`/`isLlmConfigured` (Task 1); `createVerifier`/`challengeFromVerifier` (Task 2); `buildAuthorizeUrl`/`parseCallbackCode`/`exchangeCode` (Task 3); `createLLMClient` (Task 5).
- Produces:
  - `SettingsContainer` (no props): owns the connect/exchange/save/test handlers and renders `SettingsView`. Generates PKCE + opens the authorize tab on Connect; on Submit verifies `state`, exchanges, saves tokens; saves/tests the API key.
  - `Dashboard` gains a **Settings** button (shows `SettingsContainer`) and an **auth-gate banner** ("Connect an LLM to enable auto-fill") shown when `!isLlmConfigured(settings)`.
  - `background.ts` passes an `onTokensRefreshed` callback to `createLLMClient` that persists refreshed tokens.
  - `wxt.config.ts` adds `host_permissions`.

> **Note:** `SettingsContainer` and the connect flow use `chrome.tabs` + cross-origin `fetch` (allowed by `host_permissions`). These are verified in the manual run below, not unit-tested. The Dashboard gate/route IS unit-tested. Do not reimplement any pure logic from Tasks 1–5 here — only wire it.

- [ ] **Step 1: Create `src/ui/components/SettingsContainer.tsx`**

```typescript
import { useEffect, useRef, useState } from "react";
import { SettingsView, type AuthStatus } from "./SettingsView";
import { defaultSettings, type Settings } from "../../models/types";
import { getSettings, saveSettings } from "../../data/settingsRepo";
import { createVerifier, challengeFromVerifier } from "../../llm/oauth/pkce";
import { buildAuthorizeUrl, parseCallbackCode, exchangeCode } from "../../llm/oauth/oauthFlow";
import { createLLMClient } from "../../llm/factory";

export function SettingsContainer({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [status, setStatus] = useState<AuthStatus>("not_connected");
  const [statusMessage, setStatusMessage] = useState("");
  const pkce = useRef<{ verifier: string; state: string } | null>(null);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  async function persist(next: Settings) {
    await saveSettings(next);
    setSettings(next);
  }

  async function selectBackend(llmBackend: "apiKey" | "oauth") {
    await persist({ ...settings, llmBackend });
  }

  async function saveApiKey(apiKey: string) {
    await persist({ ...settings, llmBackend: "apiKey", apiKey });
    setStatusMessage("API key saved.");
  }

  async function testApiKey() {
    setStatusMessage("Testing…");
    try {
      const client = createLLMClient(settings);
      await client.complete([{ role: "user", content: "Reply with OK." }], { maxTokens: 5 });
      setStatus("connected");
      setStatusMessage("API key works.");
    } catch (err) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Test failed.");
    }
  }

  async function connect() {
    const verifier = createVerifier();
    const state = createVerifier();
    pkce.current = { verifier, state };
    const challenge = await challengeFromVerifier(verifier);
    await chrome.tabs.create({ url: buildAuthorizeUrl({ challenge, state }) });
    setStatusMessage("Authorize in the new tab, then paste the code here.");
  }

  async function submitCode(rawPasted: string) {
    const saved = pkce.current;
    const { code, state } = parseCallbackCode(rawPasted);
    if (!saved || (state !== "" && state !== saved.state)) {
      setStatus("error");
      setStatusMessage("State mismatch — please Connect again.");
      return;
    }
    try {
      const tokens = await exchangeCode({ code, state, verifier: saved.verifier });
      await persist({
        ...settings,
        llmBackend: "oauth",
        oauthAccessToken: tokens.accessToken,
        oauthRefreshToken: tokens.refreshToken,
        oauthExpiresAt: tokens.expiresAt,
      });
      setStatus("connected");
      setStatusMessage("Connected to your Claude subscription.");
    } catch (err) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Couldn't connect — try again.");
    }
  }

  async function disconnect() {
    await persist({ ...settings, oauthAccessToken: "", oauthRefreshToken: "", oauthExpiresAt: 0 });
    setStatus("not_connected");
    setStatusMessage("Disconnected.");
  }

  return (
    <SettingsView
      settings={settings}
      status={status}
      statusMessage={statusMessage}
      onSelectBackend={(b) => void selectBackend(b)}
      onSaveApiKey={(k) => void saveApiKey(k)}
      onTestApiKey={() => void testApiKey()}
      onConnect={() => void connect()}
      onSubmitCode={(p) => void submitCode(p)}
      onDisconnect={() => void disconnect()}
      onClose={onClose}
    />
  );
}
```

- [ ] **Step 2: Write the failing Dashboard test (add to `src/ui/components/Dashboard.test.tsx`)**

```typescript
import { saveSettings } from "../../data/settingsRepo";
import { defaultSettings } from "../../models/types";

  it("shows the auth-gate banner until an LLM is configured", async () => {
    await markSetupComplete();
    render(<Dashboard />);
    expect(await screen.findByText(/connect an llm to enable auto-fill/i)).toBeInTheDocument();
  });

  it("opens Settings from the header", async () => {
    await markSetupComplete();
    await saveSettings({ ...defaultSettings(), apiKey: "sk-x" });
    render(<Dashboard />);
    await userEvent.click(await screen.findByRole("button", { name: /settings/i }));
    expect(await screen.findByRole("heading", { name: /^settings$/i })).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/ui/components/Dashboard.test.tsx`
Expected: FAIL — no Settings button / banner yet.

- [ ] **Step 4: Update `src/ui/components/Dashboard.tsx`** (full file)

```typescript
import { useEffect, useState } from "react";
import { useApplications } from "../hooks/useApplications";
import { ApplicationList } from "./ApplicationList";
import { ApplicationForm } from "./ApplicationForm";
import { ProfileWizard } from "./ProfileWizard";
import { SettingsContainer } from "./SettingsContainer";
import {
  createApplication,
  updateApplication,
  deleteApplication,
  type NewApplication,
} from "../../data/applicationRepo";
import { getSettings, markSetupComplete, isLlmConfigured } from "../../data/settingsRepo";
import { saveProfile } from "../../data/profileRepo";
import type { Application, Profile } from "../../models/types";

type View = "loading" | "wizard" | "list" | "settings";

export function Dashboard() {
  const [view, setView] = useState<View>("loading");
  const [editing, setEditing] = useState<Application | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [configured, setConfigured] = useState(true);
  const { apps, reload } = useApplications();

  async function refreshGate() {
    setConfigured(isLlmConfigured(await getSettings()));
  }

  useEffect(() => {
    void getSettings().then((s) => {
      setConfigured(isLlmConfigured(s));
      setView(s.setupComplete ? "list" : "wizard");
    });
  }, []);

  async function finishWizard(profile: Profile) {
    await saveProfile(profile);
    await markSetupComplete();
    setView("list");
  }

  async function submitForm(values: NewApplication) {
    if (editing?.id != null) {
      await updateApplication(editing.id, values);
    } else {
      await createApplication(values);
    }
    setShowForm(false);
    setEditing(null);
    reload();
  }

  async function remove(id: number) {
    await deleteApplication(id);
    reload();
  }

  if (view === "loading") return <p>Loading…</p>;
  if (view === "wizard") return <ProfileWizard onComplete={(p) => void finishWizard(p)} />;
  if (view === "settings") {
    return <SettingsContainer onClose={() => { setView("list"); void refreshGate(); }} />;
  }

  return (
    <div>
      <header>
        <h1>Applications</h1>
        <button type="button" onClick={() => setView("settings")}>Settings</button>
      </header>
      {!configured && <p role="alert">Connect an LLM to enable auto-fill — open Settings.</p>}
      {showForm ? (
        <ApplicationForm
          initial={editing ?? undefined}
          onSubmit={(v) => void submitForm(v)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      ) : (
        <>
          <button type="button" onClick={() => { setEditing(null); setShowForm(true); }}>
            Add application
          </button>
          <ApplicationList
            apps={apps}
            onEdit={(a) => { setEditing(a); setShowForm(true); }}
            onDelete={(id) => void remove(id)}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the Dashboard test**

Run: `pnpm test src/ui/components/Dashboard.test.tsx`
Expected: PASS (existing cases + the 2 new ones).

- [ ] **Step 6: Wire `onTokensRefreshed` in `entrypoints/background.ts`**

In `runPlanner`, replace the `createLLMClient(settings)` call so refreshed OAuth tokens persist. Find:

```typescript
    const client = createLLMClient(settings);
```

Replace with:

```typescript
    const client = createLLMClient(settings, (t) => {
      void saveSettings({
        ...settings,
        oauthAccessToken: t.accessToken,
        oauthRefreshToken: t.refreshToken,
        oauthExpiresAt: t.expiresAt,
      });
    });
```

And add `saveSettings` to the existing settings import at the top of the file:

```typescript
import { getSettings, saveSettings } from "../src/data/settingsRepo";
```

- [ ] **Step 7: Update `wxt.config.ts`** (full file)

```typescript
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Job Application Assistant",
    permissions: ["storage", "sidePanel", "activeTab", "scripting", "tabs"],
    host_permissions: ["https://console.anthropic.com/*", "https://api.anthropic.com/*"],
    action: {},
    side_panel: { default_path: "sidepanel.html" },
  },
});
```

- [ ] **Step 8: Run full suite + build**

Run: `pnpm test`
Expected: all tests pass.
Run: `pnpm build`
Expected: WXT builds with no type errors.

- [ ] **Step 9: Manual end-to-end verification**

1. `pnpm dev`; load the unpacked extension.
2. Open the dashboard → the **auth-gate banner** shows. Click **Settings**.
3. **API-key path:** pick "Anthropic API key", paste a key, **Save**, **Test** → "API key works." Banner clears.
4. **OAuth path:** pick "Claude subscription", click **Connect** → a tab opens to `claude.ai/oauth/authorize`. Authorize; copy the `code#state`. **Confirm the authorize host, scopes, and that the callback shows a code** (the values flagged "verify during manual run"). Paste it → **Submit** → "Connected." Banner clears.
5. Run an auto-fill (Slice 2) with the OAuth backend selected; confirm a request succeeds (and, if a run spans >1h, that a refresh persists silently).
6. If the token endpoint or scopes have drifted, update `src/llm/oauth/constants.ts` (single file) and re-test.

- [ ] **Step 10: Commit**

```bash
git add job-application-assistant/src/ui/components/SettingsContainer.tsx job-application-assistant/src/ui/components/Dashboard.tsx job-application-assistant/src/ui/components/Dashboard.test.tsx job-application-assistant/entrypoints/background.ts job-application-assistant/wxt.config.ts
git commit -m "feat: wire Settings UI, auth gate, OAuth connect glue, and host permissions"
```

---

## Spec Coverage Notes

- **Covered:** Settings model + token storage + `isLlmConfigured` gate (Task 1); PKCE (Task 2); authorize/exchange/refresh + centralized brittle constants (Task 3); shared body helpers (Task 4); `OAuthLLMClient` with `x-api-key` transport, impersonation headers, Claude-Code system prepend, proactive + 401 refresh-retry, factory wiring (Task 5); `SettingsView` API-key + OAuth UI (Task 6); connect/exchange glue, dashboard Settings route + auth-gate banner, `onTokensRefreshed` persistence, `host_permissions`, and the manual verification that confirms the reverse-engineered scopes/endpoints (Task 7).
- **Deferred (per spec):** encryption-at-rest for stored secrets, `chrome.identity.launchWebAuthFlow`, Gmail OAuth (separate slice), auto-minting a durable API key via `create_api_key`.
