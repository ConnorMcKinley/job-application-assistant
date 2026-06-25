# LLM Auth & Settings (OAuth-first) — Design

**Status:** Approved (alignment session)
**Date:** 2026-06-25
**Depends on:** Slice 1 (`LLMClient`, `settingsRepo`, dashboard), Slice 2 (the service worker is the `LLMClient` caller).
**Priority:** Prioritized ahead of the Gmail slice — it is the gate to running the product at all.
**Parent:** [Job Application Assistant Vision & Architecture](2026-06-25-job-application-assistant-architecture.md)

## Problem

The product currently cannot run end-to-end: there is **no UI to supply LLM credentials**. Slice 1 built
`settingsRepo` but nothing collects an API key or connects any account, so the Slice 2 auto-fill engine
calls the model with an empty key. This slice builds the **Settings/auth UI** and implements the
**Claude-subscription OAuth backend** (so the user can run without a paid API key), with **API-key entry as
the supported fallback**. Everything plugs into the existing `LLMClient` factory seam.

## Research findings that shape this design

Subscription OAuth is an **unofficial, reverse-engineered** path that Anthropic is actively restricting.
The design accounts for the current (2026) reality:

- **Token transport changed:** `Authorization: Bearer` is now rejected ("OAuth authentication is currently
  not supported"). The OAuth access token (`sk-ant-oat01-…`) must be sent as **`x-api-key`** with
  **Claude-Code impersonation headers** and a prepended "You are Claude Code" system block.
- **Redirect constraint:** the only registered redirect (`console.anthropic.com/oauth/code/callback`) shows
  a code to copy, so `chrome.identity.launchWebAuthFlow` is unusable — we use a **manual code-paste** flow.
- **Fragility:** these values may change without notice. All brittle constants live in **one file**.
- This path is acceptable for the user's **personal testing**; the UI labels it **experimental**. API key
  remains the supported default.

## Architecture

Auth is fully behind the `LLMClient` seam — the rest of the app (the Slice 2 planner/orchestrator) is
unchanged.

- **`createLLMClient(settings)`** (existing factory; currently throws for `"oauth"`) now returns either
  `ApiKeyLLMClient` (existing) or the new `OAuthLLMClient`. This is the only call-site change.
- **`src/llm/oauth/`** (new, isolated, mostly pure):
  - `constants.ts` — client_id, authorize/token endpoints, scopes, beta header, user-agent, model. The
    single place to edit when Anthropic shifts the goalposts.
  - `pkce.ts` — `createVerifier(): string`, `challengeFromVerifier(verifier): Promise<string>` (S256,
    base64url).
  - `oauthFlow.ts` — `buildAuthorizeUrl({ challenge, state })`, `exchangeCode({ code, state, verifier, fetchFn })`,
    `refreshTokens({ refreshToken, fetchFn })`, plus `parseCallbackCode(pasted): { code, state }` (splits
    `code#state`). Returns a typed `OAuthTokens { accessToken; refreshToken; expiresAt }`.
  - `oauthClient.ts` — `OAuthLLMClient implements LLMClient`.
- **`settingsRepo` / `Settings`** — extended with `oauthAccessToken`, `oauthRefreshToken`, `oauthExpiresAt`.
- **`SettingsView`** (new React component) — choose method, enter/test API key, connect/disconnect
  subscription, show status. Reached from a dashboard header button; the dashboard shows an **auth gate
  banner** until a method is configured.
- **`wxt.config.ts`** — add `host_permissions` for `https://console.anthropic.com/*` and
  `https://api.anthropic.com/*` (background fetches bypass CORS with host permissions). The authorize page
  opens in a tab via the existing `tabs` permission.

## The connect flow (manual code-paste)

1. User clicks **Connect Claude subscription**.
2. Background generates PKCE `verifier` + `challenge` (S256) and a random `state`, stashes them, and opens a
   tab to `buildAuthorizeUrl(...)`:
   `https://claude.ai/oauth/authorize?response_type=code&client_id=<id>&redirect_uri=https://console.anthropic.com/oauth/code/callback&scope=org:create_api_key%20user:profile%20user:inference&code_challenge=<challenge>&code_challenge_method=S256&state=<state>`
3. User authorizes; the callback page shows a code formatted `code#state`.
4. User pastes it into Settings. `parseCallbackCode` splits it, `state` is verified, then `exchangeCode`
   does `POST https://console.anthropic.com/v1/oauth/token`
   `{ grant_type:"authorization_code", code, state, client_id, redirect_uri, code_verifier }` →
   `{ access_token, refresh_token, expires_in }`.
5. Persist `OAuthTokens` (with `expiresAt = now + expires_in`). Status → **Connected**.

> **Verify during the manual run:** the `scope` values and the `claude.ai/oauth/authorize` host are from
> reverse-engineered references and are the most likely to have drifted. Confirm them in the spike/first run.

## Making calls — `OAuthLLMClient`

Same Messages API as `ApiKeyLLMClient`, but:

- Headers: `x-api-key: <accessToken>` (NOT Bearer), `anthropic-beta: claude-code-20250219,oauth-2025-04-20`,
  `user-agent: claude-cli/1.0`, `x-app: cli`, `anthropic-version: 2023-06-01`, `content-type`.
- **System prepend:** `system` is sent as a two-block array —
  `[{ type:"text", text:"You are Claude Code, Anthropic's official CLI for Claude." }, { type:"text", text:<caller system> }]`.
  The planner's system prompt is untouched; this wrapping lives only in the OAuth backend.
- Images (Slice 2 screenshot path) attach to the last user message exactly as in `ApiKeyLLMClient`.
- **Refresh:** if `expiresAt` is within a small skew, refresh before calling; on a `401`, refresh once and
  retry; persist refreshed tokens via an injected `onTokensRefreshed(tokens)` callback. A second failure
  throws a clear "reconnect needed" error.

`OAuthLLMClient` is constructed with the current `OAuthTokens`, a `fetchFn` (default `fetch`), and an
`onTokensRefreshed` callback. The factory supplies the callback that writes back to `settingsRepo`.

## Settings UI

`SettingsView` props are driven by current settings + callbacks:

- **Method toggle:** API key vs Claude subscription (experimental).
- **API key:** masked input, **Save**, and a **Test** button that makes one cheap Messages call and reports
  success/failure.
- **Claude subscription:** **Connect** button (triggers the flow), a **paste-code** field + **Submit**, a
  status line (Connected / Expired / Not connected), and **Disconnect** (clears tokens).
- The dashboard header gets a **Settings** button; the dashboard shows a banner **"Connect an LLM to enable
  auto-fill"** whenever no method is configured (no API key and no OAuth tokens).

## Error handling

- Invalid/expired paste code → "Couldn't connect — try again."
- `state` mismatch on paste → reject.
- Refresh failure → clear tokens, set status to reconnect-needed; the Slice 2 orchestrator already aborts the
  run safely on a thrown planner error.
- API-key **Test** failure → show the status code/message.

## Testing strategy

Pure logic is unit-tested; chrome/tab glue is manually verified (consistent with prior slices).

- `pkce` — verifier charset/length; challenge is base64url S256 of the verifier.
- `oauthFlow` — authorize-URL params; `parseCallbackCode` split + edge cases; `exchangeCode`/`refreshTokens`
  request bodies and response→`OAuthTokens` parsing (mocked fetch); expiry computation.
- `OAuthLLMClient` — mocked fetch asserts `x-api-key` (not Bearer), impersonation headers, the prepended
  Claude-Code system block, image passthrough, and the **401 → refresh → retry → persist** path.
- `factory` — returns `OAuthLLMClient` for `"oauth"` (no longer throws); still returns `ApiKeyLLMClient` for
  `"apiKey"`.
- `settingsRepo` — token fields persist; an `isLlmConfigured(settings)` helper (true when an API key or
  OAuth tokens exist) for the gate.
- `SettingsView` — Testing Library: method toggle, key save, paste-code submit, status states, disconnect.

## Build order (each item is one or more plan tasks)

1. **Settings model + repo** — add token fields + `isLlmConfigured` helper.
2. **PKCE** — `pkce.ts`.
3. **OAuth flow + constants** — `oauthFlow.ts`, `constants.ts`.
4. **`OAuthLLMClient` + factory wiring** — headers, system-prepend, 401-refresh-retry, factory returns it.
5. **`SettingsView`** — API-key entry + OAuth connect/status/disconnect; dashboard Settings route + auth gate.
6. **Background glue + manifest** — open authorize tab, persist tokens, `host_permissions`; end-to-end manual
   verification (including confirming scopes/endpoints still work).

## Out of scope

- Encryption-at-rest for stored secrets (shared deferred hardening item).
- `chrome.identity.launchWebAuthFlow` (incompatible with the registered redirect).
- Gmail OAuth (separate Gmail slice).
- Auto-minting a durable API key via `create_api_key` (possible future enhancement to avoid 8h refresh).

## Open questions deferred to the plan / manual run

- Exact current `scope` string and authorize host (`claude.ai` vs `console.anthropic.com`).
- Whether the `expires_in` skew for proactive refresh should be 60s or larger.
- Exact `user-agent` Claude-CLI version string Anthropic currently accepts.
