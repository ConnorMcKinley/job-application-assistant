# Job Application Assistant

A browser extension that helps you **track, apply to, and follow up on jobs** — with AI assistance, and all your data kept local in your own browser.

> **Status:** Slice 1 (Core foundation) complete. Auto-fill and Gmail sync are on the roadmap below.

## Vision

One place to:

1. **Track** every application — company, role, location, link, date, and status — in a sortable dashboard.
2. **Auto-fill** new applications in *your own logged-in browser*, with the AI advancing through screens and you always owning the final submit.
3. **Sync status** automatically by reading your inbox (rejection / interview / offer / "log into the portal"), updating the dashboard for you.

The AI runs *inside* the extension through a swappable client, authenticating with either an **Anthropic API key** or a **Claude subscription (OAuth)** — end users don't need any developer tooling.

## What works today (Slice 1)

- **Local data layer** — a typed [Dexie](https://dexie.org/) schema over IndexedDB with repositories for applications, profile, and settings. Nothing leaves your browser.
- **Dashboard** — a sortable list of applications with add / edit / delete.
- **Profile setup wizard** — a first-run, re-editable flow capturing the data applications keep asking for.
- **LLM client scaffold** — one `LLMClient` interface with an Anthropic API-key backend and a factory (the OAuth backend is stubbed for a later slice). No UI consumes it yet.

Built test-first: **28 passing tests** and a clean `pnpm build`.

## Tech stack

[WXT](https://wxt.dev/) (Manifest V3) · React 18 · TypeScript (strict) · Dexie 4 / IndexedDB · Vitest + Testing Library · pnpm.

## Getting started

Requires Node ≥ 20 and pnpm. Run everything from this project directory.

```bash
pnpm install      # installs deps and runs `wxt prepare`
pnpm test         # run the full Vitest suite
pnpm dev          # start WXT dev mode (hot-reloading extension)
pnpm build        # production build → .output/chrome-mv3/
```

To load it in Chrome/Edge: run `pnpm dev` (or `pnpm build`), open `chrome://extensions`, enable **Developer mode**, and **Load unpacked** pointing at the generated `.output/chrome-mv3/` directory. The dashboard opens in its own tab on install.

## Architecture

```
src/
  models/types.ts        # Application, Profile, Settings, enums (single source of truth)
  data/                  # Dexie instance + repositories (applications, profile, settings)
  llm/                   # LLMClient interface, Anthropic API-key backend, factory
  ui/
    sort.ts              # pure sort helper
    hooks/               # useApplications
    components/          # ApplicationList, ApplicationForm, ProfileWizard, Dashboard
entrypoints/
  dashboard/             # full-page dashboard tab
  background.ts          # opens the dashboard on install
```

Dependencies flow one way: `models → data → ui hooks → ui components → Dashboard → entrypoints`.

## Roadmap

- **Slice 2 — Auto-fill engine:** content script reads the live application page (DOM + screenshot), an LLM planner maps your profile onto the fields, an executor fills + auto-advances with checkpoints and a hard stop before submit; the application is auto-captured into the dashboard.
- **Slice 3 — Gmail sync:** OAuth + classifier + matcher; high-confidence status changes apply automatically, the rest queue in a review inbox.
- **Slice 4+ — Automations:** cover-letter / "why this company" tailoring, interview scheduling, follow-up nudges.

Design docs live in [`docs/superpowers/`](docs/superpowers/).

## Privacy

All profile data and application records stay in your browser's IndexedDB. The only outbound network calls are to your chosen LLM provider, using credentials you supply. Gmail access (a later slice) starts read-only and is opt-in.
