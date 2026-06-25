# Job Application Assistant — Vision & Architecture Design

**Status:** Approved (alignment session)
**Date:** 2026-06-25
**Scope:** Overarching vision + architecture. Each build slice gets its own detailed spec.

## Problem

Applying to jobs is repetitive and easy to lose track of: the same personal/education/experience
data is re-entered into every portal, applications scatter across dozens of ATS systems, and
status updates arrive as unstructured email. This tool gives one person a single place to (1) track
every application, (2) auto-fill new applications using their real, logged-in browser, and (3) keep
statuses current by reading their inbox — with the human always in control of submits and sends.

## Audience & operator model

A **standalone product usable by non-technical people**. The AI runs *inside* the app via a
swappable `LLMClient` with two auth backends: an **Anthropic API key** or **Claude-subscription
OAuth** (the "Claude Code license" path). End users do not need Claude Code installed.

## Architecture: single MV3 browser extension (extension-only)

One Chrome/Edge (Manifest V3) extension is the entire product. No server, no separate desktop app,
one install. All data stays in the user's browser.

| Component | Responsibility |
|---|---|
| **Dashboard** (React, full-page tab) | Sortable application list; add/edit; profile setup wizard; settings; Gmail review inbox. |
| **IndexedDB + typed repository layer** | All profile PII and application records, local to the browser. |
| **`LLMClient`** | One interface, two swappable backends (API key / OAuth). Used by auto-fill and Gmail modules. Nothing else knows which backend is active. |
| **Service worker** | Background brain: `chrome.alarms` for periodic Gmail checks; message router between dashboard ↔ content script. |
| **Content script** | The "arm" in the page: serializes DOM + captures screenshot; executes fill/click instructions in the real, logged-in tab. |

### Known limits of extension-only (accepted)
- Data is browser-bound (no cross-machine sync in v1).
- Service-worker background tasks must be short-lived (Gmail checks are chunked).
- Secrets live in extension storage (encryption-at-rest is a hardening item; see Guardrails).

## Modules

1. **Core** — data store + dashboard + first-run profile setup wizard (re-editable via Settings) + `LLMClient` scaffold.
2. **LLMClient** — pluggable auth (API key / OAuth), shared by modules 3 & 4.
3. **Auto-fill engine** — DOM/screenshot capture → LLM planner (maps profile + Q&A bank onto detected fields) → executor with auto-advance, checkpoints, and a hard stop before submit. Auto-captures the Application record on submit.
4. **Gmail connector** — `chrome.identity` OAuth → fetch new mail → LLM classifier → email-to-application matcher → auto-apply confident status changes / queue the rest in a review inbox.

## Data model

### `Application`
`id` · `company` · `position` · `location { type: onsite | remote | hybrid, place }` · `jobUrl` ·
`atsType` (greenhouse / workday / lever / …) · `appliedDate` · `status` · `linkedEmails[]` ·
`recruiterContacts[]` · `notes` · `createdAt` · `updatedAt`.

### `status` enum
`saved` → `applied` → `action_needed` (portal login required) → `under_review` → `interview` →
`offer` / `accepted` → `rejected` → `withdrawn`. A derived `ghosted` flag is set after N silent days.

### `Profile` (the setup data), grouped
- **Personal** — name, contact, address, LinkedIn / GitHub / portfolio.
- **Education** — school, degree, field, dates, GPA.
- **Experience** — work-history entries (company, title, dates, description).
- **Work auth & EEO** — sponsorship needed, veteran / disability / demographics (all optional).
- **Documents** — resume file, cover-letter template.
- **Preferences** — salary, locations, start date, relocation.
- **Q&A bank** — saved answers to recurring free-text questions ("why this company"), reused/adapted by the AI.

## Key flows

### A. First run / setup
On install the dashboard opens to a setup wizard (grouped Profile sections, progressive — skippable
and finishable later). User selects an auth path (paste API key *or* connect Claude OAuth). Resume
upload parses into structured fields the user confirms (first automation: don't retype what the
resume already contains).

### B. Auto-fill a job application
1. User navigates to the application page and handles login (their responsibility, real session).
2. User clicks the extension → "Start application."
3. Content script captures DOM + screenshot → planner maps profile + Q&A bank onto detected fields → fill plan with per-field confidence.
4. Executor fills confident fields, highlights everything it touched, and **halts on ambiguous fields** for user input.
5. Before each advance click it shows "about to go to next screen"; user can pause/abort anytime.
6. **Final submit is always the user's.** On submit, the Application record is auto-captured (company, role, URL, ATS, date, status = `applied`).

*Automation candidates:* tailor cover letter / "why this company" from Q&A bank + job description;
remember per-ATS field patterns to fill faster next time.

### C. Gmail status sync
Service-worker alarm (~every 15 min) pulls new mail → classifier tags each (rejection / interview /
offer / action-needed / irrelevant) → matcher links it to an Application (recruiter domain, ATS
sender, company name, plus job URLs/contacts captured in Flow B). **High-confidence + matched →
auto-update** with an "AI-updated · view email" trail. **Everything else → review inbox** for
one-click confirm.

*Automation candidates:* auto-draft interview-scheduling replies; calendar-add detected interview
times; nudge on `action_needed` portals; flag `ghosted` apps for follow-up.

## Trust & guardrails (cross-cutting)
- **PII stays local** (IndexedDB). Secrets (API key, OAuth + Gmail tokens) in extension storage; encryption-at-rest is a hardening item.
- **Gmail scope read-only to start** (`gmail.readonly`); reply/calendar automations are opt-in later scopes.
- **The AI never submits an application and never sends an email without explicit user approval.**
- Auto-fill: auto-advance is allowed, but each advance is announced, ambiguous fields halt the run, and final submit requires the human.
- Gmail: only high-confidence, matched signals auto-update status; everything else is queued for review.

## Build order (each slice = its own detailed spec)
1. **Slice 1 — Core foundation:** data model + dashboard (sortable list, manual add/edit) + profile setup wizard + `LLMClient` scaffold. Independently useful as a manual tracker; everything else writes to this.
2. **Slice 2 — Auto-fill engine:** the differentiator; begins auto-populating the dashboard.
3. **Slice 3 — Gmail sync:** depends on applications existing + capture data from Slice 2 for matching.
4. **Slice 4+ — Automations:** cover-letter tailoring, interview scheduling, follow-up nudges.

## Out of scope (v1)
Cross-device sync, hosted backend, multi-user accounts, non-Chromium browsers, sending email or
booking calendar events on the user's behalf (later opt-in), mobile.

## Open questions deferred to slice specs
- Exact `LLMClient` OAuth flow mechanics for the Claude-subscription path (proven feasible previously; mechanics to be confirmed in Slice 1 spec).
- DOM-serialization strategy and screenshot fidelity/token cost trade-offs (Slice 2).
- Gmail matching heuristics + confidence thresholds, and incremental-fetch/state strategy (Slice 3).
