# Slice 2: Auto-fill Engine — Design

**Status:** Approved (alignment session)
**Date:** 2026-06-25
**Depends on:** Slice 1 (Core foundation) — data model, repositories, `LLMClient`, dashboard.
**Parent:** [Job Application Assistant Vision & Architecture](2026-06-25-job-application-assistant-architecture.md)

## Problem

Re-entering the same profile data into every job application is the most repetitive part of
applying. Slice 2 lets the AI fill a real application in the user's own logged-in browser: it reads
the live form, maps the user's saved profile + Q&A bank onto the fields, fills the confident ones,
stops on anything ambiguous, advances through multi-screen flows on the user's approval, and never
submits or attaches files on its own. On submit, the application is auto-captured into the Slice 1
dashboard.

## Scope decisions (from the alignment session)

- **Perception:** hybrid — structured DOM extraction is the base; a cropped screenshot is pulled only
  when the planner flags a field `needsVisual` or the extractor marks it `readable: false`.
- **Control surface:** the Chrome **Side Panel** (`chrome.sidePanel`) hosts all run UI; the content
  script only highlights and executes in-page.
- **File uploads:** always a **manual checkpoint** — the engine never attaches files. (Resume-as-Blob
  storage + auto-attach is a future enhancement.)
- **Free-text generation:** **deferred.** Slice 2 fills free-text only from a confident Q&A-bank
  match; unmatched open-ended questions become checkpoints. LLM-drafted tailored answers are a later
  slice that plugs into the same side panel.
- **Autonomy:** auto-advance with checkpoints; every advance announced and abortable; **final submit
  is always the user's**. (Decided in the architecture session.)
- **Confidence threshold:** fill at/above **0.8**, checkpoint below. (Tunable in Settings later.)

## Architecture: three contexts, one orchestrator

```
Side Panel (React)        Service Worker (orchestrator)        Content Script (DOM)
  run controls       <->    state machine + LLMClient    <->     extractFields
  filled list             planner call + plan validation        applyFill / click
  checkpoint prompts      message router                        highlight overlays
  Pause/Advance/Stop                                            captureRegion (on demand)
```

- **Content script** — the senses + hands. Pure-ish DOM functions: `extractFields`, `applyFill`,
  `findAdvanceControl` / `isSubmitControl`, `captureRegion`, highlight overlays. No LLM, no app state.
- **Service worker** — the brain. Owns the run **state machine**, builds the profile projection,
  makes the single planner LLM call per screen (+ at most one screenshot re-plan pass), validates the
  plan, and routes all messages. The only context that touches the `LLMClient`.
- **Side panel** — the face. React UI for status, the filled-field list, checkpoints, and controls.
  Reuses Slice 1 repos + `LLMClient`.

## Data flow (one screen)

1. Panel **Start** → SW asks content script to `extractFields`.
2. SW builds a compact **profile projection** (+ Q&A bank + any remembered `atsPatterns`) and calls the
   **planner**.
3. Planner returns a per-field plan `{ value, confidence, source, needsVisual, reason }`.
4. For `needsVisual` / `readable:false` fields, SW requests a cropped screenshot and re-plans just
   those (one extra pass max per screen).
5. SW sends confident fills (`confidence ≥ 0.8`) to the content script → `applyFill` + green highlight.
6. Ambiguous (`< 0.8` / `value:null`), file, and unmatched free-text fields → **checkpoints** (amber)
   in the panel.
7. On the user's approval, SW finds the advance control, announces "about to continue," and clicks.
8. Repeat until a **submit** is detected → halt and hand the click to the user.
9. After submit, SW **auto-captures** the `Application` (company, role, URL, ATS, date, status
   `applied`), de-duped against existing rows.

## Key interfaces

### `FieldDescriptor` (output of `extractFields`)
```
{
  id: string            // stable: name/id/data-* preferred; fallback to an indexed DOM path
  locator: string       // how the executor re-finds the element (CSS or path)
  label: string         // <label for>, aria-label, aria-labelledby, placeholder, or nearest text
  kind: "text"|"email"|"tel"|"textarea"|"select"|"radio"|"checkbox"|"date"|"file"|"unknown"
  options?: string[]    // for select / radio groups
  required: boolean
  rect: { x: number; y: number; w: number; h: number }
  readable: boolean     // false → label unresolved / custom widget → visual pass
}
```

### Planner contract
- **Input:** `FieldDescriptor[]` + profile projection + Q&A bank + matching `atsPatterns`.
- **Output (strict JSON, schema-validated):**
```
FillPlan {
  fields: [{ id, value: string | null, confidence: number, source: "profile"|"qna"|"inferred",
             needsVisual: boolean, reason: string }]
}
```
- Confidence gating: `≥ 0.8` fill; otherwise checkpoint. A malformed plan **aborts the run safely**
  (no actions taken) rather than guessing.

### Executor (`applyFill`), per kind
- text/email/tel/textarea → focus, set value, dispatch `input` + `change` (React-controlled forms
  register the change).
- select → match option by value or visible text.
- radio/checkbox → click the matching option.
- date → normalize to the input's expected format.
- file → **never touched**; always a manual checkpoint.

### Navigation sensing
- `findAdvanceControl(document)` → the next/continue button (button text + `type=submit` heuristics).
- `isSubmitControl(el)` → flags terminal submits (e.g. "Submit application", final step) so the run
  halts for the user.

## New persistence

- **`atsPatterns`** Dexie store, keyed by ATS type / host → remembered `label → profileKey` mappings,
  reused by the planner to plan faster and cheaper on repeat sites. Everything else reuses Slice 1's
  Dexie schema and repositories.

## Guardrails

- The AI **never** clicks a final submit and **never** attaches files.
- Every advance is announced and abortable; ambiguous fields halt the run.
- Planner output is schema-validated; malformed output aborts safely instead of acting.
- At most **one** screenshot re-plan pass per screen (cost ceiling); screenshots are cropped to field
  rects, not full-page, where possible.
- The content script reads/acts only on an explicit run; nothing happens on page load.

## Testing strategy

Pure logic is unit-tested without a real browser, mirroring Slice 1:
- `extractFields`, `applyFill`, `findAdvanceControl`, `isSubmitControl` → jsdom with HTML fixtures
  (a Greenhouse-like and a Lever-like sample form).
- planner → mocked `LLMClient`; assert JSON parsing/validation and confidence gating.
- orchestrator state machine → a pure reducer, tested through its transitions.
- side-panel React → Testing Library.
- Chrome glue (sidePanel / messaging / tabs / screenshot capture) stays thin and is covered by a
  documented manual verification run.

## Build order (each item is one or more plan tasks)

1. **DOM perception** — `FieldDescriptor` type + `extractFields` (+ jsdom fixtures).
2. **Executor** — `applyFill` per kind + highlight overlays.
3. **Navigation sensing** — `findAdvanceControl` / `isSubmitControl`.
4. **Planner** — profile-projection builder + LLM call + strict JSON validation + confidence gating.
5. **`atsPatterns` store** — Dexie store + reuse on plan.
6. **Orchestrator state machine** — pure reducer in the service worker + message routing.
7. **Side panel UI** — controls, filled list, checkpoint prompts; messaging wiring.
8. **Auto-capture** — `Application` creation + de-dup, and end-to-end manual verification.

## Out of scope (Slice 2)

LLM-drafted free-text answers, resume/file auto-attach + Blob storage, fully custom/canvas widget
support beyond the screenshot fallback, non-Chromium browsers, Gmail (Slice 3), OAuth LLM backend.

## Open questions deferred to the plan

- Exact stable-locator algorithm for fields lacking `id`/`name` (indexed DOM path format).
- Screenshot API path under MV3 (`chrome.tabs.captureVisibleTab` + crop vs other) and its permission.
- `atsType` detection heuristics (host/DOM signatures for Greenhouse/Lever/Ashby/Workday).
- Profile-projection shape passed to the planner (which fields, how compacted).
