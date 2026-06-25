# Slice 2: Auto-fill Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI fill a real job application in the user's logged-in browser — read the live form, map the saved profile/Q&A onto fields, fill confident ones, checkpoint the rest, auto-advance with the user's approval, never submit or attach files, and auto-capture the application on submit.

**Architecture:** Three runtime contexts over `chrome.runtime` messages — a **content script** (pure-ish DOM perception + execution), a **service worker** orchestrator (a pure reducer state machine + the only `LLMClient` caller), and a **Side Panel** React UI. The pure-logic core is unit-tested in jsdom / with a mocked LLM; Chrome glue is thin and manually verified.

**Tech Stack:** WXT (MV3), React 18, TypeScript strict, Dexie 4, Vitest + jsdom + Testing Library. Builds on Slice 1.

## Global Constraints

- WXT MV3; TypeScript strict + `noUncheckedIndexedAccess`; no `any` in app code.
- React 18 function components + hooks only. Dexie 4 / IndexedDB; tests use `fake-indexeddb`.
- Vitest + jsdom; component tests use `@testing-library/react`. Run `pnpm` from inside `job-application-assistant/`.
- The AI **never** clicks a final submit and **never** attaches files.
- Confidence threshold: fill at/above **0.8**, checkpoint below. Constant `DEFAULT_CONFIDENCE_THRESHOLD = 0.8`.
- `FieldKind` values verbatim: `text`, `email`, `tel`, `textarea`, `select`, `radio`, `checkbox`, `date`, `file`, `unknown`.
- `FillSource` values verbatim: `profile`, `qna`, `inferred`.
- Planner output is strict JSON, schema-validated; malformed output throws and aborts the run (no actions taken).
- At most one screenshot re-plan pass per screen.
- Each code change is committed at the end of its task.

---

## File Structure

```
src/
  models/types.ts                 # MODIFY: add AtsPattern interface (Task 9)
  data/
    db.ts                         # MODIFY: version(2) + atsPatterns table (Task 9)
    atsPatternsRepo.ts            # NEW: get/merge ATS field-mapping memory (Task 9)
  llm/
    LLMClient.ts                  # MODIFY: opts.images?: string[] (Task 7)
    apiKeyClient.ts               # MODIFY: attach image blocks (Task 7)
  autofill/
    types.ts                      # NEW: FieldDescriptor, FillPlan, run state/events, messages (Task 1)
    confidence.ts                 # NEW: DEFAULT_CONFIDENCE_THRESHOLD, partitionPlan (Task 1)
    extract.ts                    # NEW: extractFields (Task 2)
    execute.ts                    # NEW: applyFill + highlightField (Task 3)
    navigate.ts                   # NEW: findAdvanceControl, isSubmitControl (Task 4)
    atsDetect.ts                  # NEW: detectAtsType (Task 5)
    projection.ts                 # NEW: buildProfileProjection (Task 6)
    planner.ts                    # NEW: parseFillPlan, buildPlannerMessages, planFills (Task 8)
    capture.ts                    # NEW: captureApplication (de-dup) (Task 10)
    orchestrator.ts               # NEW: pure reducer state machine (Task 11)
    contentHandler.ts             # NEW: pure content-message handler (Task 12)
    sidepanelMessages.ts          # NEW: typed panel<->SW message helpers (Task 13)
  ui/components/
    SidePanel.tsx                 # NEW: run controls + checkpoints UI (Task 13)
    SidePanel.test.tsx
entrypoints/
  content.ts                      # NEW: thin content-script wiring (Task 12)
  sidepanel/
    index.html                    # NEW: side panel page (Task 13)
    main.tsx                      # NEW: mount SidePanel (Task 13)
  background.ts                   # MODIFY: orchestrator host + sidePanel + capture (Task 14)
wxt.config.ts                     # MODIFY: permissions + sidepanel (Task 14)
```

---

### Task 1: Slice 2 core types + confidence partition

**Files:**
- Create: `src/autofill/types.ts`
- Create: `src/autofill/confidence.ts`
- Test: `src/autofill/confidence.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `FieldKind` (union of the 10 kinds), `FillSource` (`"profile"|"qna"|"inferred"`).
  - `FieldDescriptor { id; locator; label; kind: FieldKind; options?: string[]; required: boolean; rect: {x;y;w;h}; readable: boolean }`.
  - `FillPlanField { id: string; value: string | null; confidence: number; source: FillSource; needsVisual: boolean; reason: string }`.
  - `FillPlan { fields: FillPlanField[] }`.
  - `DEFAULT_CONFIDENCE_THRESHOLD = 0.8`.
  - `partitionPlan(fields: FillPlanField[], kinds: Record<string, FieldKind>, threshold?): { fills: FillPlanField[]; checkpoints: FillPlanField[] }` — a field is a **fill** iff its kind is not `"file"`, `value` is a non-null non-empty string, and `confidence >= threshold`; everything else is a **checkpoint**.

- [ ] **Step 1: Create `src/autofill/types.ts`**

```typescript
export type FieldKind =
  | "text" | "email" | "tel" | "textarea" | "select"
  | "radio" | "checkbox" | "date" | "file" | "unknown";

export type FillSource = "profile" | "qna" | "inferred";

export interface FieldRect { x: number; y: number; w: number; h: number }

export interface FieldDescriptor {
  id: string;
  locator: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  required: boolean;
  rect: FieldRect;
  readable: boolean;
}

export interface FillPlanField {
  id: string;
  value: string | null;
  confidence: number;
  source: FillSource;
  needsVisual: boolean;
  reason: string;
}

export interface FillPlan {
  fields: FillPlanField[];
}
```

- [ ] **Step 2: Write the failing test `src/autofill/confidence.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { partitionPlan, DEFAULT_CONFIDENCE_THRESHOLD } from "./confidence";
import type { FillPlanField, FieldKind } from "./types";

function f(over: Partial<FillPlanField>): FillPlanField {
  return { id: "x", value: "v", confidence: 0.9, source: "profile", needsVisual: false, reason: "", ...over };
}

describe("partitionPlan", () => {
  it("defaults the threshold to 0.8", () => {
    expect(DEFAULT_CONFIDENCE_THRESHOLD).toBe(0.8);
  });

  it("fills confident, non-file, non-null fields and checkpoints the rest", () => {
    const fields = [
      f({ id: "a", confidence: 0.9 }),
      f({ id: "b", confidence: 0.5 }),
      f({ id: "c", value: null, confidence: 1 }),
      f({ id: "d", confidence: 0.95 }),
    ];
    const kinds: Record<string, FieldKind> = { a: "text", b: "text", c: "text", d: "file" };
    const { fills, checkpoints } = partitionPlan(fields, kinds);
    expect(fills.map((x) => x.id)).toEqual(["a"]);
    expect(checkpoints.map((x) => x.id).sort()).toEqual(["b", "c", "d"]);
  });

  it("treats an empty-string value as a checkpoint", () => {
    const { fills, checkpoints } = partitionPlan([f({ id: "a", value: "" })], { a: "text" });
    expect(fills).toHaveLength(0);
    expect(checkpoints).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/autofill/confidence.test.ts`
Expected: FAIL — cannot resolve `./confidence`.

- [ ] **Step 4: Create `src/autofill/confidence.ts`**

```typescript
import type { FieldKind, FillPlanField } from "./types";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

export function partitionPlan(
  fields: FillPlanField[],
  kinds: Record<string, FieldKind>,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): { fills: FillPlanField[]; checkpoints: FillPlanField[] } {
  const fills: FillPlanField[] = [];
  const checkpoints: FillPlanField[] = [];
  for (const field of fields) {
    const isFile = kinds[field.id] === "file";
    const hasValue = typeof field.value === "string" && field.value !== "";
    if (!isFile && hasValue && field.confidence >= threshold) {
      fills.push(field);
    } else {
      checkpoints.push(field);
    }
  }
  return { fills, checkpoints };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/autofill/confidence.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add job-application-assistant/src/autofill/types.ts job-application-assistant/src/autofill/confidence.ts job-application-assistant/src/autofill/confidence.test.ts
git commit -m "feat: add autofill core types and confidence partition"
```

---

### Task 2: `extractFields` — DOM perception

**Files:**
- Create: `src/autofill/extract.ts`
- Test: `src/autofill/extract.test.ts`

**Interfaces:**
- Consumes: `FieldDescriptor`, `FieldKind` (Task 1).
- Produces: `extractFields(root: ParentNode): FieldDescriptor[]` — returns one descriptor per fillable control (`input` except hidden/submit/button/reset/image, `textarea`, `select`); radios sharing a `name` collapse into one `radio` descriptor with `options`; skips `disabled` and `[type=hidden]`. `label` resolves via `<label for>`, wrapping `<label>`, `aria-label`, `placeholder` (in that order); `readable` is `false` when none resolve. `locator` is `#id`, else `[name="..."]`, else a `tag:nth-of-type` path. `rect` comes from `getBoundingClientRect()`.

- [ ] **Step 1: Write the failing test `src/autofill/extract.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { extractFields } from "./extract";

function dom(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("extractFields", () => {
  it("extracts text inputs with label-for resolution", () => {
    const root = dom(`<label for="fn">Full name</label><input id="fn" name="full_name" type="text" required>`);
    const fields = extractFields(root);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe("Full name");
    expect(fields[0]!.kind).toBe("text");
    expect(fields[0]!.locator).toBe("#fn");
    expect(fields[0]!.required).toBe(true);
    expect(fields[0]!.readable).toBe(true);
  });

  it("falls back to placeholder and marks unresolved labels unreadable", () => {
    const root = dom(`<input name="email" type="email" placeholder="Email address"><input name="mystery" type="text">`);
    const fields = extractFields(root);
    const email = fields.find((f) => f.id.includes("email"))!;
    expect(email.label).toBe("Email address");
    expect(email.kind).toBe("email");
    const mystery = fields.find((f) => f.id.includes("mystery"))!;
    expect(mystery.readable).toBe(false);
  });

  it("collapses a radio group into one descriptor with options", () => {
    const root = dom(`
      <label><input type="radio" name="auth" value="yes">Yes</label>
      <label><input type="radio" name="auth" value="no">No</label>`);
    const fields = extractFields(root);
    const radios = fields.filter((f) => f.kind === "radio");
    expect(radios).toHaveLength(1);
    expect(radios[0]!.options).toEqual(["yes", "no"]);
    expect(radios[0]!.locator).toBe(`[name="auth"]`);
  });

  it("captures select options and skips hidden/disabled/button inputs", () => {
    const root = dom(`
      <select name="src"><option value="li">LinkedIn</option><option value="ref">Referral</option></select>
      <input type="hidden" name="csrf"><input type="submit" value="Go"><input name="off" disabled>`);
    const fields = extractFields(root);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.kind).toBe("select");
    expect(fields[0]!.options).toEqual(["li", "ref"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/autofill/extract.test.ts`
Expected: FAIL — cannot resolve `./extract`.

- [ ] **Step 3: Create `src/autofill/extract.ts`**

```typescript
import type { FieldDescriptor, FieldKind, FieldRect } from "./types";

type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const SKIP_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "file"]);

function rectOf(el: Element): FieldRect {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

function inputKind(el: Fillable): FieldKind {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return "select";
  const t = el.type;
  if (t === "email") return "email";
  if (t === "tel") return "tel";
  if (t === "date") return "date";
  if (t === "checkbox") return "checkbox";
  if (t === "radio") return "radio";
  if (t === "text" || t === "") return "text";
  return "unknown";
}

function resolveLabel(el: Fillable): string {
  if (el.id) {
    const forLabel = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
    if (forLabel?.textContent) return forLabel.textContent.trim();
  }
  const wrapping = el.closest("label");
  if (wrapping?.textContent) {
    const text = wrapping.textContent.trim();
    if (text) return text;
  }
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return placeholder.trim();
  return "";
}

function buildLocator(el: Element, root: ParentNode): string {
  if (el.id) return `#${el.id}`;
  const name = el.getAttribute("name");
  if (name) return `[name="${name}"]`;
  const tag = el.tagName.toLowerCase();
  const same = Array.from(root.querySelectorAll(tag));
  return `${tag}:nth-of-type(${same.indexOf(el) + 1})`;
}

export function extractFields(root: ParentNode): FieldDescriptor[] {
  const fields: FieldDescriptor[] = [];
  const seenRadioNames = new Set<string>();
  const controls = Array.from(
    root.querySelectorAll<Fillable>("input, textarea, select"),
  );

  for (const el of controls) {
    if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) continue;
    if ((el as HTMLInputElement).disabled) continue;

    const kind = inputKind(el);

    if (kind === "radio") {
      const name = el.getAttribute("name") ?? "";
      if (name && seenRadioNames.has(name)) continue;
      if (name) seenRadioNames.add(name);
      const group = Array.from(
        root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`),
      );
      const label = resolveLabel(el);
      fields.push({
        id: name || buildLocator(el, root),
        locator: name ? `[name="${name}"]` : buildLocator(el, root),
        label,
        kind: "radio",
        options: group.map((r) => r.value),
        required: group.some((r) => r.required),
        rect: rectOf(el),
        readable: label !== "",
      });
      continue;
    }

    const label = resolveLabel(el);
    const descriptor: FieldDescriptor = {
      id: el.id || el.getAttribute("name") || buildLocator(el, root),
      locator: buildLocator(el, root),
      label,
      kind,
      required: (el as HTMLInputElement).required ?? false,
      rect: rectOf(el),
      readable: label !== "",
    };
    if (el instanceof HTMLSelectElement) {
      descriptor.options = Array.from(el.options).map((o) => o.value);
    }
    fields.push(descriptor);
  }

  return fields;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/autofill/extract.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/autofill/extract.ts job-application-assistant/src/autofill/extract.test.ts
git commit -m "feat: add extractFields DOM perception"
```

---

### Task 3: `applyFill` + highlight — executor

**Files:**
- Create: `src/autofill/execute.ts`
- Test: `src/autofill/execute.test.ts`

**Interfaces:**
- Consumes: `FieldDescriptor` (Task 1).
- Produces:
  - `applyFill(root: ParentNode, field: FieldDescriptor, value: string): boolean` — type-aware: text/email/tel/textarea/date set the value via the native setter and dispatch `input`+`change`; `select` picks the option matching value or visible text; `checkbox` checks when value is truthy (`"true"/"yes"/"on"` or equals the label) and dispatches `click`; `radio` clicks the option whose `value` or label matches; `file` is never touched and returns `false`. Returns `true` when a value was applied.
  - `highlightField(el: HTMLElement, state: "filled" | "needs"): void` — sets an outline (`filled` green, `needs` amber).

- [ ] **Step 1: Write the failing test `src/autofill/execute.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { applyFill, highlightField } from "./execute";
import type { FieldDescriptor } from "./types";

function dom(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}
function fd(over: Partial<FieldDescriptor>): FieldDescriptor {
  return { id: "x", locator: "#x", label: "", kind: "text", required: false,
    rect: { x: 0, y: 0, w: 0, h: 0 }, readable: true, ...over };
}

describe("applyFill", () => {
  it("sets a text input value and dispatches input+change", () => {
    const root = dom(`<input id="x" type="text">`);
    const onInput = vi.fn();
    root.querySelector("#x")!.addEventListener("input", onInput);
    const ok = applyFill(root, fd({ locator: "#x" }), "Connor");
    expect(ok).toBe(true);
    expect((root.querySelector("#x") as HTMLInputElement).value).toBe("Connor");
    expect(onInput).toHaveBeenCalled();
  });

  it("selects a matching option by value or text", () => {
    const root = dom(`<select id="s"><option value="li">LinkedIn</option><option value="ref">Referral</option></select>`);
    expect(applyFill(root, fd({ locator: "#s", kind: "select" }), "Referral")).toBe(true);
    expect((root.querySelector("#s") as HTMLSelectElement).value).toBe("ref");
  });

  it("clicks the matching radio option", () => {
    const root = dom(`<input type="radio" name="auth" value="yes"><input type="radio" name="auth" value="no">`);
    expect(applyFill(root, fd({ locator: `[name="auth"]`, kind: "radio" }), "no")).toBe(true);
    expect((root.querySelector(`[value="no"]`) as HTMLInputElement).checked).toBe(true);
  });

  it("never touches a file input", () => {
    const root = dom(`<input id="f" type="file">`);
    expect(applyFill(root, fd({ locator: "#f", kind: "file" }), "resume.pdf")).toBe(false);
  });
});

describe("highlightField", () => {
  it("applies an outline for the filled state", () => {
    const el = document.createElement("input");
    highlightField(el, "filled");
    expect(el.style.outline).toContain("solid");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/autofill/execute.test.ts`
Expected: FAIL — cannot resolve `./execute`.

- [ ] **Step 3: Create `src/autofill/execute.ts`**

```typescript
import type { FieldDescriptor } from "./types";

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function isTruthy(value: string): boolean {
  return ["true", "yes", "on", "1"].includes(value.trim().toLowerCase());
}

export function applyFill(root: ParentNode, field: FieldDescriptor, value: string): boolean {
  if (field.kind === "file") return false;

  if (field.kind === "radio") {
    const options = Array.from(root.querySelectorAll<HTMLInputElement>(field.locator));
    const target = options.find(
      (o) => o.value === value || o.closest("label")?.textContent?.trim() === value,
    );
    if (!target) return false;
    target.click();
    return true;
  }

  const el = root.querySelector(field.locator);
  if (!el) return false;

  if (el instanceof HTMLSelectElement) {
    const match = Array.from(el.options).find(
      (o) => o.value === value || o.text.trim() === value,
    );
    if (!match) return false;
    el.value = match.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    const shouldCheck = isTruthy(value) || el.value === value || field.label === value;
    if (el.checked !== shouldCheck) el.click();
    return true;
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, value);
    return true;
  }

  return false;
}

export function highlightField(el: HTMLElement, state: "filled" | "needs"): void {
  el.style.outline = state === "filled" ? "2px solid #16a34a" : "2px solid #d97706";
  el.style.outlineOffset = "1px";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/autofill/execute.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/autofill/execute.ts job-application-assistant/src/autofill/execute.test.ts
git commit -m "feat: add applyFill executor and field highlighting"
```

---

### Task 4: Navigation sensing

**Files:**
- Create: `src/autofill/navigate.ts`
- Test: `src/autofill/navigate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `findAdvanceControl(root: ParentNode): HTMLElement | null` — the first visible, enabled `button` / `input[type=submit]` whose trimmed text/value matches `/next|continue|save and continue|review/i`; returns `null` when none.
  - `isSubmitControl(el: Element): boolean` — `true` when the element's text/value matches `/submit|apply|finish/i`.

- [ ] **Step 1: Write the failing test `src/autofill/navigate.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { findAdvanceControl, isSubmitControl } from "./navigate";

function dom(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("findAdvanceControl", () => {
  it("finds a Next/Continue button", () => {
    const root = dom(`<button type="button">Back</button><button type="button">Continue</button>`);
    expect(findAdvanceControl(root)?.textContent).toBe("Continue");
  });
  it("returns null when there is no advance control", () => {
    const root = dom(`<button>Cancel</button>`);
    expect(findAdvanceControl(root)).toBeNull();
  });
  it("ignores disabled controls", () => {
    const root = dom(`<button disabled>Next</button>`);
    expect(findAdvanceControl(root)).toBeNull();
  });
});

describe("isSubmitControl", () => {
  it("flags submit/apply/finish controls", () => {
    const root = dom(`<button>Submit application</button>`);
    expect(isSubmitControl(root.querySelector("button")!)).toBe(true);
  });
  it("does not flag a plain Next button", () => {
    const root = dom(`<button>Next</button>`);
    expect(isSubmitControl(root.querySelector("button")!)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/autofill/navigate.test.ts`
Expected: FAIL — cannot resolve `./navigate`.

- [ ] **Step 3: Create `src/autofill/navigate.ts`**

```typescript
const ADVANCE_RE = /next|continue|save and continue|review/i;
const SUBMIT_RE = /submit|apply|finish/i;

function controlText(el: Element): string {
  if (el instanceof HTMLInputElement) return el.value.trim();
  return (el.textContent ?? "").trim();
}

export function findAdvanceControl(root: ParentNode): HTMLElement | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('button, input[type="submit"]'),
  );
  for (const el of candidates) {
    if ((el as HTMLButtonElement).disabled) continue;
    if (ADVANCE_RE.test(controlText(el))) return el;
  }
  return null;
}

export function isSubmitControl(el: Element): boolean {
  return SUBMIT_RE.test(controlText(el));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/autofill/navigate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/autofill/navigate.ts job-application-assistant/src/autofill/navigate.test.ts
git commit -m "feat: add navigation sensing (advance/submit detection)"
```

---

### Task 5: ATS detection

**Files:**
- Create: `src/autofill/atsDetect.ts`
- Test: `src/autofill/atsDetect.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `detectAtsType(host: string): string` — returns `"greenhouse" | "lever" | "ashby" | "workday" | "generic"` from substring checks on the host.

- [ ] **Step 1: Write the failing test `src/autofill/atsDetect.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { detectAtsType } from "./atsDetect";

describe("detectAtsType", () => {
  it.each([
    ["boards.greenhouse.io", "greenhouse"],
    ["jobs.lever.co", "lever"],
    ["jobs.ashbyhq.com", "ashby"],
    ["acme.wd1.myworkdayjobs.com", "workday"],
    ["careers.acme.com", "generic"],
  ])("maps %s to %s", (host, expected) => {
    expect(detectAtsType(host)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/autofill/atsDetect.test.ts`
Expected: FAIL — cannot resolve `./atsDetect`.

- [ ] **Step 3: Create `src/autofill/atsDetect.ts`**

```typescript
export function detectAtsType(host: string): string {
  const h = host.toLowerCase();
  if (h.includes("greenhouse")) return "greenhouse";
  if (h.includes("lever.co")) return "lever";
  if (h.includes("ashbyhq")) return "ashby";
  if (h.includes("workday") || h.includes("myworkdayjobs")) return "workday";
  return "generic";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/autofill/atsDetect.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/autofill/atsDetect.ts job-application-assistant/src/autofill/atsDetect.test.ts
git commit -m "feat: add ATS type detection"
```

---

### Task 6: Profile projection

**Files:**
- Create: `src/autofill/projection.ts`
- Test: `src/autofill/projection.test.ts`

**Interfaces:**
- Consumes: `Profile` (Slice 1, `src/models/types.ts`).
- Produces: `buildProfileProjection(profile: Profile): Record<string, string>` — a flat, human-readable map the planner can match labels against: personal fields, the first education entry, the first experience entry, and preference fields. Empty values are omitted. Keys are stable snake-ish labels (e.g. `fullName`, `email`, `phone`, `linkedin`, `github`, `portfolio`, `address`, `school`, `degree`, `fieldOfStudy`, `mostRecentCompany`, `mostRecentTitle`, `desiredSalary`, `desiredLocations`, `startDate`, `willingToRelocate`, `needsSponsorship`).

- [ ] **Step 1: Write the failing test `src/autofill/projection.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildProfileProjection } from "./projection";
import { emptyProfile } from "../models/types";

describe("buildProfileProjection", () => {
  it("flattens populated profile fields and omits empties", () => {
    const p = emptyProfile();
    p.personal.fullName = "Connor McKinley";
    p.personal.email = "c@example.com";
    p.education = [{ school: "MIT", degree: "BS", field: "CS", startDate: "", endDate: "", gpa: "" }];
    p.preferences.willingToRelocate = true;

    const proj = buildProfileProjection(p);
    expect(proj.fullName).toBe("Connor McKinley");
    expect(proj.email).toBe("c@example.com");
    expect(proj.school).toBe("MIT");
    expect(proj.fieldOfStudy).toBe("CS");
    expect(proj.willingToRelocate).toBe("yes");
    expect("phone" in proj).toBe(false); // empty omitted
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/autofill/projection.test.ts`
Expected: FAIL — cannot resolve `./projection`.

- [ ] **Step 3: Create `src/autofill/projection.ts`**

```typescript
import type { Profile } from "../models/types";

export function buildProfileProjection(profile: Profile): Record<string, string> {
  const edu = profile.education[0];
  const exp = profile.experience[0];
  const candidates: Record<string, string> = {
    fullName: profile.personal.fullName,
    email: profile.personal.email,
    phone: profile.personal.phone,
    address: profile.personal.address,
    linkedin: profile.personal.linkedin,
    github: profile.personal.github,
    portfolio: profile.personal.portfolio,
    school: edu?.school ?? "",
    degree: edu?.degree ?? "",
    fieldOfStudy: edu?.field ?? "",
    mostRecentCompany: exp?.company ?? "",
    mostRecentTitle: exp?.title ?? "",
    desiredSalary: profile.preferences.desiredSalary,
    desiredLocations: profile.preferences.desiredLocations,
    startDate: profile.preferences.startDate,
    willingToRelocate: profile.preferences.willingToRelocate ? "yes" : "",
    needsSponsorship: profile.workAuth.needsSponsorship ? "yes" : "",
  };

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(candidates)) {
    if (v !== "") out[k] = v;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/autofill/projection.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/autofill/projection.ts job-application-assistant/src/autofill/projection.test.ts
git commit -m "feat: add profile projection for the planner"
```

---

### Task 7: LLMClient image support

**Files:**
- Modify: `src/llm/LLMClient.ts`
- Modify: `src/llm/apiKeyClient.ts`
- Test: `src/llm/apiKeyClient.test.ts` (add a case)

**Interfaces:**
- Consumes: existing `LLMClient` (Slice 1).
- Produces: `LLMCompleteOptions` gains `images?: string[]` (base64 PNG, no `data:` prefix). When `images` is non-empty, `ApiKeyLLMClient` attaches them as image blocks to the **last** user message: that message's `content` becomes an array of `{ type: "text", text }` followed by `{ type: "image", source: { type: "base64", media_type: "image/png", data } }` blocks. Text-only calls are unchanged.

- [ ] **Step 1: Update the interface `src/llm/LLMClient.ts`** (add `images` to options)

```typescript
export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMCompleteOptions {
  system?: string;
  maxTokens?: number;
  images?: string[];
}

export interface LLMClient {
  complete(messages: LLMMessage[], opts?: LLMCompleteOptions): Promise<string>;
}
```

- [ ] **Step 2: Add the failing test case to `src/llm/apiKeyClient.test.ts`**

Append this `it(...)` inside the existing `describe("ApiKeyLLMClient", ...)` block:

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/llm/apiKeyClient.test.ts`
Expected: FAIL — the new case fails (content is still a plain string).

- [ ] **Step 4: Update `src/llm/apiKeyClient.ts`** to attach images

Replace the body construction so the request body is built from a helper that rewrites the last user message when images are present. The full file:

```typescript
import type { LLMClient, LLMCompleteOptions, LLMMessage } from "./LLMClient";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

type ApiMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "user" | "assistant"; content: Array<Record<string, unknown>> };

function buildMessages(messages: LLMMessage[], images?: string[]): ApiMessage[] {
  if (!images || images.length === 0) return messages;
  const out: ApiMessage[] = messages.slice(0, -1);
  const last = messages[messages.length - 1];
  if (!last) return messages;
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
        messages: buildMessages(messages, opts.images),
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status}`);
    }

    const data = (await res.json()) as { content: AnthropicContentBlock[] };
    return data.content
      .filter((b): b is AnthropicContentBlock & { text: string } =>
        b.type === "text" && typeof b.text === "string",
      )
      .map((b) => b.text)
      .join("");
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/llm/apiKeyClient.test.ts`
Expected: PASS (3 tests — the two original plus the new image case).

- [ ] **Step 6: Commit**

```bash
git add job-application-assistant/src/llm/LLMClient.ts job-application-assistant/src/llm/apiKeyClient.ts job-application-assistant/src/llm/apiKeyClient.test.ts
git commit -m "feat: add image-block support to the LLM client"
```

---

### Task 8: Planner — build messages, call LLM, validate plan

**Files:**
- Create: `src/autofill/planner.ts`
- Test: `src/autofill/planner.test.ts`

**Interfaces:**
- Consumes: `FieldDescriptor`, `FillPlan`, `FillPlanField`, `FillSource` (Task 1); `LLMClient`, `LLMMessage` (Slice 1 + Task 7); `buildProfileProjection` output shape (Task 6).
- Produces:
  - `parseFillPlan(raw: string): FillPlan` — strips ```` ```json ```` fences, `JSON.parse`, and validates that `fields` is an array of objects each having `id: string`, `value: string | null`, `confidence: number`, `source` in the `FillSource` set, `needsVisual: boolean`, `reason: string`. Throws `Error("Invalid fill plan: ...")` on any violation.
  - `buildPlannerMessages(fields, projection, qna): { system: string; messages: LLMMessage[] }` — a system prompt instructing strict-JSON output matching `FillPlan`, and a single user message embedding the JSON of fields + projection + Q&A.
  - `planFills(args: { fields: FieldDescriptor[]; projection: Record<string,string>; qna: { question: string; answer: string }[]; client: LLMClient; images?: string[] }): Promise<FillPlan>` — builds messages, calls `client.complete(messages, { system, images })`, returns `parseFillPlan(result)`.

- [ ] **Step 1: Write the failing test `src/autofill/planner.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { parseFillPlan, planFills } from "./planner";
import type { LLMClient } from "../llm/LLMClient";
import type { FieldDescriptor } from "./types";

const field: FieldDescriptor = {
  id: "full_name", locator: "#full_name", label: "Full name", kind: "text",
  required: true, rect: { x: 0, y: 0, w: 0, h: 0 }, readable: true,
};

describe("parseFillPlan", () => {
  it("parses a fenced JSON plan", () => {
    const raw = "```json\n" + JSON.stringify({
      fields: [{ id: "full_name", value: "Connor", confidence: 0.95, source: "profile", needsVisual: false, reason: "matched fullName" }],
    }) + "\n```";
    const plan = parseFillPlan(raw);
    expect(plan.fields[0]!.value).toBe("Connor");
    expect(plan.fields[0]!.source).toBe("profile");
  });

  it("throws on a malformed plan", () => {
    expect(() => parseFillPlan(`{"fields":[{"id":1}]}`)).toThrow(/Invalid fill plan/);
    expect(() => parseFillPlan(`not json`)).toThrow(/Invalid fill plan/);
  });
});

describe("planFills", () => {
  it("calls the client with a system prompt and parses the result", async () => {
    const responseJson = JSON.stringify({
      fields: [{ id: "full_name", value: "Connor", confidence: 0.95, source: "profile", needsVisual: false, reason: "x" }],
    });
    const client: LLMClient = { complete: vi.fn(async () => responseJson) };
    const plan = await planFills({
      fields: [field], projection: { fullName: "Connor" }, qna: [], client,
    });
    expect(plan.fields[0]!.value).toBe("Connor");
    const call = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1].system).toMatch(/JSON/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/autofill/planner.test.ts`
Expected: FAIL — cannot resolve `./planner`.

- [ ] **Step 3: Create `src/autofill/planner.ts`**

```typescript
import type { LLMClient, LLMMessage } from "../llm/LLMClient";
import type { FieldDescriptor, FillPlan, FillPlanField, FillSource } from "./types";

const SOURCES: FillSource[] = ["profile", "qna", "inferred"];

function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced ? fenced[1]! : raw).trim();
}

function isField(v: unknown): v is FillPlanField {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.id === "string" &&
    (f.value === null || typeof f.value === "string") &&
    typeof f.confidence === "number" &&
    typeof f.source === "string" &&
    SOURCES.includes(f.source as FillSource) &&
    typeof f.needsVisual === "boolean" &&
    typeof f.reason === "string"
  );
}

export function parseFillPlan(raw: string): FillPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    throw new Error("Invalid fill plan: not JSON");
  }
  const obj = parsed as { fields?: unknown };
  if (!Array.isArray(obj.fields) || !obj.fields.every(isField)) {
    throw new Error("Invalid fill plan: bad fields shape");
  }
  return { fields: obj.fields };
}

export function buildPlannerMessages(
  fields: FieldDescriptor[],
  projection: Record<string, string>,
  qna: { question: string; answer: string }[],
): { system: string; messages: LLMMessage[] } {
  const system =
    "You map a user's saved profile onto a web form. " +
    "Return ONLY strict JSON of shape " +
    `{"fields":[{"id","value":string|null,"confidence":0..1,"source":"profile"|"qna"|"inferred","needsVisual":boolean,"reason"}]}. ` +
    "Use null value and low confidence when unsure. Set needsVisual=true only if the field is unreadable without a screenshot.";
  const user = JSON.stringify({ fields, profile: projection, qna });
  return { system, messages: [{ role: "user", content: user }] };
}

export async function planFills(args: {
  fields: FieldDescriptor[];
  projection: Record<string, string>;
  qna: { question: string; answer: string }[];
  client: LLMClient;
  images?: string[];
}): Promise<FillPlan> {
  const { system, messages } = buildPlannerMessages(args.fields, args.projection, args.qna);
  const raw = await args.client.complete(messages, { system, images: args.images });
  return parseFillPlan(raw);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/autofill/planner.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/autofill/planner.ts job-application-assistant/src/autofill/planner.test.ts
git commit -m "feat: add planner (prompt build, LLM call, strict plan validation)"
```

---

### Task 9: `atsPatterns` store

**Files:**
- Modify: `src/models/types.ts` (add `AtsPattern`)
- Modify: `src/data/db.ts` (version 2 + table)
- Create: `src/data/atsPatternsRepo.ts`
- Test: `src/data/atsPatternsRepo.test.ts`

**Interfaces:**
- Consumes: `db` (Slice 1).
- Produces:
  - `AtsPattern { key: string; mappings: Record<string, string> }` (key = ATS type or host; `mappings` = field label → profile key).
  - `db.atsPatterns` table (primary key `key`), added in `db.version(2)`.
  - `getPattern(key: string): Promise<AtsPattern | undefined>`; `mergePattern(key: string, mappings: Record<string,string>): Promise<void>` — upserts, merging new mappings over existing ones.

- [ ] **Step 1: Add `AtsPattern` to `src/models/types.ts`**

Append to the file:

```typescript
export interface AtsPattern {
  key: string;
  mappings: Record<string, string>;
}
```

- [ ] **Step 2: Update `src/data/db.ts`** to add the table at version 2

Add the import and the new table to the typed instance, and append a `version(2)`:

```typescript
import Dexie, { type EntityTable } from "dexie";
import type { Application, Profile, Settings, AtsPattern } from "../models/types";

const database = new Dexie("JobApplicationAssistant") as Dexie & {
  applications: EntityTable<Application, "id">;
  profile: EntityTable<Profile, "id">;
  settings: EntityTable<Settings, "id">;
  atsPatterns: EntityTable<AtsPattern, "key">;
};

database.version(1).stores({
  applications: "++id, company, status, appliedDate",
  profile: "id",
  settings: "id",
});

database.version(2).stores({
  atsPatterns: "key",
});

export const db = database;
```

- [ ] **Step 3: Write the failing test `src/data/atsPatternsRepo.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { getPattern, mergePattern } from "./atsPatternsRepo";

describe("atsPatternsRepo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("returns undefined for an unknown key", async () => {
    expect(await getPattern("greenhouse")).toBeUndefined();
  });

  it("merges mappings across calls", async () => {
    await mergePattern("greenhouse", { "Full name": "fullName" });
    await mergePattern("greenhouse", { "Email": "email" });
    const p = await getPattern("greenhouse");
    expect(p!.mappings).toEqual({ "Full name": "fullName", "Email": "email" });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test src/data/atsPatternsRepo.test.ts`
Expected: FAIL — cannot resolve `./atsPatternsRepo`.

- [ ] **Step 5: Create `src/data/atsPatternsRepo.ts`**

```typescript
import { db } from "./db";
import type { AtsPattern } from "../models/types";

export async function getPattern(key: string): Promise<AtsPattern | undefined> {
  return db.atsPatterns.get(key);
}

export async function mergePattern(
  key: string,
  mappings: Record<string, string>,
): Promise<void> {
  const existing = await db.atsPatterns.get(key);
  const merged = { ...(existing?.mappings ?? {}), ...mappings };
  await db.atsPatterns.put({ key, mappings: merged });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test src/data/atsPatternsRepo.test.ts`
Expected: PASS (2 tests). Full suite still green: `pnpm test`.

- [ ] **Step 7: Commit**

```bash
git add job-application-assistant/src/models/types.ts job-application-assistant/src/data/db.ts job-application-assistant/src/data/atsPatternsRepo.ts job-application-assistant/src/data/atsPatternsRepo.test.ts
git commit -m "feat: add atsPatterns store and repository"
```

---

### Task 10: Auto-capture with de-dup

**Files:**
- Create: `src/autofill/capture.ts`
- Test: `src/autofill/capture.test.ts`

**Interfaces:**
- Consumes: `Application` (Slice 1), `NewApplication` (Slice 1 `applicationRepo`).
- Produces: `captureApplication(input: { company: string; position: string; jobUrl: string; atsType: string }, existing: Application[], today: string): NewApplication | null` — returns a `NewApplication` (status `applied`, `appliedDate = today`, `location { type: "onsite", place: "" }`, empty `linkedEmails`/`recruiterContacts`/`notes`) or `null` when a duplicate exists (same non-empty `jobUrl`, or same `company` + `position` case-insensitively).

- [ ] **Step 1: Write the failing test `src/autofill/capture.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { captureApplication } from "./capture";
import type { Application } from "../models/types";

function app(over: Partial<Application>): Application {
  return { id: 1, company: "Acme", position: "SWE", location: { type: "remote", place: "" },
    jobUrl: "https://acme.test/job", atsType: "greenhouse", appliedDate: "2026-01-01",
    status: "applied", linkedEmails: [], recruiterContacts: [], notes: "",
    createdAt: "", updatedAt: "", ...over };
}

describe("captureApplication", () => {
  it("builds a NewApplication for a fresh submission", () => {
    const result = captureApplication(
      { company: "Beta", position: "PM", jobUrl: "https://beta.test/j", atsType: "lever" },
      [], "2026-06-25",
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe("applied");
    expect(result!.appliedDate).toBe("2026-06-25");
    expect("id" in result!).toBe(false);
  });

  it("returns null on a duplicate jobUrl", () => {
    const result = captureApplication(
      { company: "X", position: "Y", jobUrl: "https://acme.test/job", atsType: "greenhouse" },
      [app({})], "2026-06-25",
    );
    expect(result).toBeNull();
  });

  it("returns null on a duplicate company+position (case-insensitive)", () => {
    const result = captureApplication(
      { company: "acme", position: "swe", jobUrl: "", atsType: "greenhouse" },
      [app({})], "2026-06-25",
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/autofill/capture.test.ts`
Expected: FAIL — cannot resolve `./capture`.

- [ ] **Step 3: Create `src/autofill/capture.ts`**

```typescript
import type { Application } from "../models/types";
import type { NewApplication } from "../data/applicationRepo";

export function captureApplication(
  input: { company: string; position: string; jobUrl: string; atsType: string },
  existing: Application[],
  today: string,
): NewApplication | null {
  const dup = existing.some((a) => {
    if (input.jobUrl && a.jobUrl === input.jobUrl) return true;
    return (
      a.company.toLowerCase() === input.company.toLowerCase() &&
      a.position.toLowerCase() === input.position.toLowerCase()
    );
  });
  if (dup) return null;

  return {
    company: input.company,
    position: input.position,
    location: { type: "onsite", place: "" },
    jobUrl: input.jobUrl,
    atsType: input.atsType,
    appliedDate: today,
    status: "applied",
    linkedEmails: [],
    recruiterContacts: [],
    notes: "",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/autofill/capture.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/autofill/capture.ts job-application-assistant/src/autofill/capture.test.ts
git commit -m "feat: add application auto-capture with de-dup"
```

---

### Task 11: Orchestrator — pure reducer state machine

**Files:**
- Create: `src/autofill/orchestrator.ts`
- Test: `src/autofill/orchestrator.test.ts`

**Interfaces:**
- Consumes: `FieldDescriptor`, `FillPlanField` (Task 1).
- Produces:
  - `RunPhase = "idle" | "extracting" | "planning" | "filling" | "checkpoint" | "advancing" | "submitReady" | "done" | "aborted"`.
  - `RunState { phase: RunPhase; fields: FieldDescriptor[]; fills: FillPlanField[]; checkpoints: FillPlanField[]; screen: number; error: string | null }`.
  - `RunEvent` union: `{ type: "START" }`, `{ type: "FIELDS_EXTRACTED"; fields: FieldDescriptor[] }`, `{ type: "PLAN_PARTITIONED"; fills: FillPlanField[]; checkpoints: FillPlanField[] }`, `{ type: "FILLS_APPLIED" }`, `{ type: "ADVANCE_APPROVED" }`, `{ type: "ADVANCED" }`, `{ type: "SUBMIT_DETECTED" }`, `{ type: "ABORT"; reason: string }`, `{ type: "RESET" }`.
  - `initialRunState(): RunState`.
  - `runReducer(state: RunState, event: RunEvent): RunState` — pure transitions: START→extracting; FIELDS_EXTRACTED→planning (stores fields); PLAN_PARTITIONED→ checkpoint if any checkpoints else filling (stores fills/checkpoints); FILLS_APPLIED→ checkpoint if any checkpoints else advancing; ADVANCE_APPROVED (from checkpoint)→advancing; ADVANCED→extracting with `screen+1`; SUBMIT_DETECTED→submitReady; ABORT→aborted (stores error); RESET→idle. Unknown transitions return state unchanged.

- [ ] **Step 1: Write the failing test `src/autofill/orchestrator.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { initialRunState, runReducer } from "./orchestrator";
import type { FieldDescriptor, FillPlanField } from "./types";

const field: FieldDescriptor = { id: "a", locator: "#a", label: "A", kind: "text",
  required: false, rect: { x: 0, y: 0, w: 0, h: 0 }, readable: true };
const fill: FillPlanField = { id: "a", value: "x", confidence: 0.9, source: "profile", needsVisual: false, reason: "" };

describe("runReducer", () => {
  it("runs a clean screen with no checkpoints through to advancing", () => {
    let s = initialRunState();
    expect(s.phase).toBe("idle");
    s = runReducer(s, { type: "START" });
    expect(s.phase).toBe("extracting");
    s = runReducer(s, { type: "FIELDS_EXTRACTED", fields: [field] });
    expect(s.phase).toBe("planning");
    s = runReducer(s, { type: "PLAN_PARTITIONED", fills: [fill], checkpoints: [] });
    expect(s.phase).toBe("filling");
    s = runReducer(s, { type: "FILLS_APPLIED" });
    expect(s.phase).toBe("advancing");
  });

  it("stops at checkpoint when there are checkpoints", () => {
    let s = runReducer(initialRunState(), { type: "START" });
    s = runReducer(s, { type: "FIELDS_EXTRACTED", fields: [field] });
    s = runReducer(s, { type: "PLAN_PARTITIONED", fills: [], checkpoints: [fill] });
    expect(s.phase).toBe("checkpoint");
    s = runReducer(s, { type: "ADVANCE_APPROVED" });
    expect(s.phase).toBe("advancing");
  });

  it("increments the screen on ADVANCED and halts on SUBMIT_DETECTED", () => {
    let s: ReturnType<typeof initialRunState> = { ...initialRunState(), phase: "advancing" };
    s = runReducer(s, { type: "ADVANCED" });
    expect(s.phase).toBe("extracting");
    expect(s.screen).toBe(1);
    s = runReducer(s, { type: "SUBMIT_DETECTED" });
    expect(s.phase).toBe("submitReady");
  });

  it("aborts with a reason", () => {
    const s = runReducer(initialRunState(), { type: "ABORT", reason: "bad plan" });
    expect(s.phase).toBe("aborted");
    expect(s.error).toBe("bad plan");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/autofill/orchestrator.test.ts`
Expected: FAIL — cannot resolve `./orchestrator`.

- [ ] **Step 3: Create `src/autofill/orchestrator.ts`**

```typescript
import type { FieldDescriptor, FillPlanField } from "./types";

export type RunPhase =
  | "idle" | "extracting" | "planning" | "filling"
  | "checkpoint" | "advancing" | "submitReady" | "done" | "aborted";

export interface RunState {
  phase: RunPhase;
  fields: FieldDescriptor[];
  fills: FillPlanField[];
  checkpoints: FillPlanField[];
  screen: number;
  error: string | null;
}

export type RunEvent =
  | { type: "START" }
  | { type: "FIELDS_EXTRACTED"; fields: FieldDescriptor[] }
  | { type: "PLAN_PARTITIONED"; fills: FillPlanField[]; checkpoints: FillPlanField[] }
  | { type: "FILLS_APPLIED" }
  | { type: "ADVANCE_APPROVED" }
  | { type: "ADVANCED" }
  | { type: "SUBMIT_DETECTED" }
  | { type: "ABORT"; reason: string }
  | { type: "RESET" };

export function initialRunState(): RunState {
  return { phase: "idle", fields: [], fills: [], checkpoints: [], screen: 0, error: null };
}

export function runReducer(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case "START":
      return state.phase === "idle" ? { ...state, phase: "extracting" } : state;
    case "FIELDS_EXTRACTED":
      return { ...state, phase: "planning", fields: event.fields };
    case "PLAN_PARTITIONED":
      return {
        ...state,
        phase: event.checkpoints.length > 0 ? "checkpoint" : "filling",
        fills: event.fills,
        checkpoints: event.checkpoints,
      };
    case "FILLS_APPLIED":
      return {
        ...state,
        phase: state.checkpoints.length > 0 ? "checkpoint" : "advancing",
      };
    case "ADVANCE_APPROVED":
      return state.phase === "checkpoint" ? { ...state, phase: "advancing" } : state;
    case "ADVANCED":
      return {
        ...state,
        phase: "extracting",
        screen: state.screen + 1,
        fields: [],
        fills: [],
        checkpoints: [],
      };
    case "SUBMIT_DETECTED":
      return { ...state, phase: "submitReady" };
    case "ABORT":
      return { ...state, phase: "aborted", error: event.reason };
    case "RESET":
      return initialRunState();
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/autofill/orchestrator.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/autofill/orchestrator.ts job-application-assistant/src/autofill/orchestrator.test.ts
git commit -m "feat: add orchestrator run-state reducer"
```

---

### Task 12: Content message handler + content-script entrypoint

**Files:**
- Create: `src/autofill/contentHandler.ts`
- Test: `src/autofill/contentHandler.test.ts`
- Create: `entrypoints/content.ts`

**Interfaces:**
- Consumes: `extractFields` (Task 2), `applyFill`, `highlightField` (Task 3), `findAdvanceControl`, `isSubmitControl` (Task 4).
- Produces:
  - `ContentRequest` union: `{ type: "EXTRACT" }`, `{ type: "APPLY"; fills: { field: FieldDescriptor; value: string }[] }`, `{ type: "ADVANCE" }`, `{ type: "HIGHLIGHT"; checkpoints: string[] }` (locators to amber-highlight).
  - `ContentResponse` union: `{ type: "FIELDS"; fields: FieldDescriptor[] }`, `{ type: "APPLIED"; count: number }`, `{ type: "ADVANCED"; submit: boolean }`, `{ type: "OK" }`.
  - `handleContentMessage(req: ContentRequest, root: ParentNode & Document): ContentResponse` — pure (no chrome): EXTRACT → `extractFields`; APPLY → `applyFill` each (+ green highlight), returns count applied; ADVANCE → if an advance control exists and is not a submit, click it and return `{ submit:false }`; if it's a submit (or none found), return `{ submit:true }` without clicking; HIGHLIGHT → amber-highlight each locator.
  - `entrypoints/content.ts` — a WXT content script that forwards `chrome.runtime` messages to `handleContentMessage(req, document)`.

- [ ] **Step 1: Write the failing test `src/autofill/contentHandler.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { handleContentMessage } from "./contentHandler";
import type { FieldDescriptor } from "./types";

function setBody(html: string): void {
  document.body.innerHTML = html;
}
function fd(over: Partial<FieldDescriptor>): FieldDescriptor {
  return { id: "x", locator: "#x", label: "", kind: "text", required: false,
    rect: { x: 0, y: 0, w: 0, h: 0 }, readable: true, ...over };
}

describe("handleContentMessage", () => {
  it("EXTRACT returns descriptors", () => {
    setBody(`<input id="x" type="text">`);
    const res = handleContentMessage({ type: "EXTRACT" }, document);
    expect(res.type).toBe("FIELDS");
    if (res.type === "FIELDS") expect(res.fields).toHaveLength(1);
  });

  it("APPLY fills and reports a count", () => {
    setBody(`<input id="x" type="text">`);
    const res = handleContentMessage(
      { type: "APPLY", fills: [{ field: fd({ locator: "#x" }), value: "hi" }] }, document);
    expect(res).toEqual({ type: "APPLIED", count: 1 });
    expect((document.querySelector("#x") as HTMLInputElement).value).toBe("hi");
  });

  it("ADVANCE clicks a Next button (submit=false)", () => {
    setBody(`<button type="button">Continue</button>`);
    const res = handleContentMessage({ type: "ADVANCE" }, document);
    expect(res).toEqual({ type: "ADVANCED", submit: false });
  });

  it("ADVANCE reports submit=true on a submit control and does NOT click", () => {
    setBody(`<button type="button">Submit application</button>`);
    let clicked = false;
    document.querySelector("button")!.addEventListener("click", () => { clicked = true; });
    const res = handleContentMessage({ type: "ADVANCE" }, document);
    expect(res).toEqual({ type: "ADVANCED", submit: true });
    expect(clicked).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/autofill/contentHandler.test.ts`
Expected: FAIL — cannot resolve `./contentHandler`.

- [ ] **Step 3: Create `src/autofill/contentHandler.ts`**

```typescript
import type { FieldDescriptor } from "./types";
import { extractFields } from "./extract";
import { applyFill, highlightField } from "./execute";
import { findAdvanceControl, isSubmitControl } from "./navigate";

export type ContentRequest =
  | { type: "EXTRACT" }
  | { type: "APPLY"; fills: { field: FieldDescriptor; value: string }[] }
  | { type: "ADVANCE" }
  | { type: "HIGHLIGHT"; checkpoints: string[] };

export type ContentResponse =
  | { type: "FIELDS"; fields: FieldDescriptor[] }
  | { type: "APPLIED"; count: number }
  | { type: "ADVANCED"; submit: boolean }
  | { type: "OK" };

export function handleContentMessage(
  req: ContentRequest,
  root: ParentNode & Document,
): ContentResponse {
  switch (req.type) {
    case "EXTRACT":
      return { type: "FIELDS", fields: extractFields(root) };
    case "APPLY": {
      let count = 0;
      for (const { field, value } of req.fills) {
        if (applyFill(root, field, value)) {
          count += 1;
          const el = root.querySelector(field.locator);
          if (el instanceof HTMLElement) highlightField(el, "filled");
        }
      }
      return { type: "APPLIED", count };
    }
    case "ADVANCE": {
      const control = findAdvanceControl(root);
      if (!control || isSubmitControl(control)) return { type: "ADVANCED", submit: true };
      control.click();
      return { type: "ADVANCED", submit: false };
    }
    case "HIGHLIGHT": {
      for (const locator of req.checkpoints) {
        const el = root.querySelector(locator);
        if (el instanceof HTMLElement) highlightField(el, "needs");
      }
      return { type: "OK" };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/autofill/contentHandler.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create `entrypoints/content.ts`** (thin WXT wiring; not unit-tested — verified in Task 14's manual run)

```typescript
import { handleContentMessage, type ContentRequest } from "../src/autofill/contentHandler";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    chrome.runtime.onMessage.addListener((req: ContentRequest, _sender, sendResponse) => {
      sendResponse(handleContentMessage(req, document));
      return true;
    });
  },
});
```

- [ ] **Step 6: Commit**

```bash
git add job-application-assistant/src/autofill/contentHandler.ts job-application-assistant/src/autofill/contentHandler.test.ts job-application-assistant/entrypoints/content.ts
git commit -m "feat: add content message handler and content script"
```

---

### Task 13: Side panel UI + panel messages

**Files:**
- Create: `src/autofill/sidepanelMessages.ts`
- Create: `src/ui/components/SidePanel.tsx`
- Test: `src/ui/components/SidePanel.test.tsx`
- Create: `entrypoints/sidepanel/index.html`
- Create: `entrypoints/sidepanel/main.tsx`

**Interfaces:**
- Consumes: `RunPhase`, `FillPlanField` (Tasks 11, 1).
- Produces:
  - `PanelToSW = { type: "PANEL_START" } | { type: "PANEL_APPROVE_ADVANCE" } | { type: "PANEL_ABORT" }`.
  - `SWToPanel = { type: "PANEL_STATE"; phase: RunPhase; fills: FillPlanField[]; checkpoints: FillPlanField[]; screen: number; error: string | null }`.
  - `SidePanel` component, props `{ state: SWToPanel; onStart: () => void; onApprove: () => void; onAbort: () => void }` — shows the phase, a count of filled fields, the checkpoint list (each `label`/`reason`), a "Start" button when idle/done/aborted, an "Approve & continue" button when `phase === "checkpoint"`, a "Submit is yours — finish in the page" banner when `phase === "submitReady"`, and a "Stop" button while a run is active.
  - `entrypoints/sidepanel/{index.html,main.tsx}` — mount the panel; `main.tsx` wires `chrome.runtime` messaging to component callbacks/state (thin; verified in Task 14).

- [ ] **Step 1: Write the failing test `src/ui/components/SidePanel.test.tsx`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidePanel } from "./SidePanel";
import type { SWToPanel } from "../../autofill/sidepanelMessages";

function state(over: Partial<SWToPanel>): SWToPanel {
  return { type: "PANEL_STATE", phase: "idle", fills: [], checkpoints: [], screen: 0, error: null, ...over };
}

describe("SidePanel", () => {
  it("shows Start when idle and fires onStart", async () => {
    const onStart = vi.fn();
    render(<SidePanel state={state({ phase: "idle" })} onStart={onStart} onApprove={() => {}} onAbort={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /start/i }));
    expect(onStart).toHaveBeenCalled();
  });

  it("shows the checkpoint list and an approve button", async () => {
    const onApprove = vi.fn();
    render(
      <SidePanel
        state={state({ phase: "checkpoint",
          checkpoints: [{ id: "salary", value: null, confidence: 0.3, source: "inferred", needsVisual: false, reason: "Needs your input" }] })}
        onStart={() => {}} onApprove={onApprove} onAbort={() => {}} />,
    );
    expect(screen.getByText(/needs your input/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /approve & continue/i }));
    expect(onApprove).toHaveBeenCalled();
  });

  it("shows the submit-is-yours banner at submitReady", () => {
    render(<SidePanel state={state({ phase: "submitReady" })} onStart={() => {}} onApprove={() => {}} onAbort={() => {}} />);
    expect(screen.getByText(/submit is yours/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/ui/components/SidePanel.test.tsx`
Expected: FAIL — cannot resolve `./SidePanel`.

- [ ] **Step 3: Create `src/autofill/sidepanelMessages.ts`**

```typescript
import type { RunPhase } from "./orchestrator";
import type { FillPlanField } from "./types";

export type PanelToSW =
  | { type: "PANEL_START" }
  | { type: "PANEL_APPROVE_ADVANCE" }
  | { type: "PANEL_ABORT" };

export interface SWToPanel {
  type: "PANEL_STATE";
  phase: RunPhase;
  fills: FillPlanField[];
  checkpoints: FillPlanField[];
  screen: number;
  error: string | null;
}
```

- [ ] **Step 4: Create `src/ui/components/SidePanel.tsx`**

```typescript
import type { SWToPanel } from "../../autofill/sidepanelMessages";

interface Props {
  state: SWToPanel;
  onStart: () => void;
  onApprove: () => void;
  onAbort: () => void;
}

const ACTIVE = new Set(["extracting", "planning", "filling", "checkpoint", "advancing", "submitReady"]);

export function SidePanel({ state, onStart, onApprove, onAbort }: Props) {
  const { phase, fills, checkpoints, screen, error } = state;
  const idle = phase === "idle" || phase === "done" || phase === "aborted";

  return (
    <div>
      <h1>Auto-fill</h1>
      <p>Phase: {phase} · Screen {screen + 1}</p>
      {error ? <p role="alert">Error: {error}</p> : null}
      <p>{fills.length} field(s) filled</p>

      {phase === "checkpoint" && (
        <div>
          <h2>Needs you</h2>
          <ul>
            {checkpoints.map((c) => (
              <li key={c.id}>
                <strong>{c.id}</strong>: {c.reason}
              </li>
            ))}
          </ul>
          <button type="button" onClick={onApprove}>Approve &amp; continue</button>
        </div>
      )}

      {phase === "submitReady" && (
        <p>Submit is yours — review and finish in the page.</p>
      )}

      {idle && <button type="button" onClick={onStart}>Start auto-fill</button>}
      {ACTIVE.has(phase) && <button type="button" onClick={onAbort}>Stop</button>}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/ui/components/SidePanel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Create `entrypoints/sidepanel/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Auto-fill</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `entrypoints/sidepanel/main.tsx`** (thin messaging wiring; verified in Task 14)

```typescript
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SidePanel } from "../../src/ui/components/SidePanel";
import type { PanelToSW, SWToPanel } from "../../src/autofill/sidepanelMessages";

const initial: SWToPanel = {
  type: "PANEL_STATE", phase: "idle", fills: [], checkpoints: [], screen: 0, error: null,
};

function send(msg: PanelToSW): void {
  void chrome.runtime.sendMessage(msg);
}

function App() {
  const [state, setState] = useState<SWToPanel>(initial);
  useEffect(() => {
    const listener = (msg: SWToPanel) => {
      if (msg?.type === "PANEL_STATE") setState(msg);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
  return (
    <SidePanel
      state={state}
      onStart={() => send({ type: "PANEL_START" })}
      onApprove={() => send({ type: "PANEL_APPROVE_ADVANCE" })}
      onAbort={() => send({ type: "PANEL_ABORT" })}
    />
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<React.StrictMode><App /></React.StrictMode>);
}
```

- [ ] **Step 8: Commit**

```bash
git add job-application-assistant/src/autofill/sidepanelMessages.ts job-application-assistant/src/ui/components/SidePanel.tsx job-application-assistant/src/ui/components/SidePanel.test.tsx job-application-assistant/entrypoints/sidepanel
git commit -m "feat: add side panel UI and panel messaging"
```

---

### Task 14: Service-worker orchestration host + manifest wiring + E2E verification

**Files:**
- Modify: `entrypoints/background.ts`
- Modify: `wxt.config.ts`

**Interfaces:**
- Consumes: everything — `runReducer`/`initialRunState` (Task 11), `partitionPlan` (Task 1), `planFills` (Task 8), `buildProfileProjection` (Task 6), `detectAtsType` (Task 5), `captureApplication` (Task 10), repos + `createLLMClient`/`getSettings` (Slice 1), the content + panel message types (Tasks 12, 13).
- Produces: a background orchestrator that, per the run reducer, drives the active tab's content script and the side panel, calls the planner via the configured `LLMClient`, captures a screenshot for `needsVisual` fields (one extra pass), auto-captures the application after submit, and opens the side panel on the toolbar action. No new exported symbols; this is glue.

> **Note:** This task wires together already-tested units. It is verified by the manual end-to-end run below, not by new unit tests. Keep the background logic a thin translation of reducer phases → content/panel messages; do not reimplement any logic that lives in the tested modules.

- [ ] **Step 1: Update `wxt.config.ts`** — permissions + side panel

```typescript
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Job Application Assistant",
    permissions: ["storage", "sidePanel", "activeTab", "scripting", "tabs"],
    action: {},
    side_panel: { default_path: "sidepanel.html" },
  },
});
```

- [ ] **Step 2: Replace `entrypoints/background.ts`** with the orchestration host

```typescript
import { initialRunState, runReducer, type RunState } from "../src/autofill/orchestrator";
import { partitionPlan } from "../src/autofill/confidence";
import { planFills } from "../src/autofill/planner";
import { buildProfileProjection } from "../src/autofill/projection";
import { detectAtsType } from "../src/autofill/atsDetect";
import { captureApplication } from "../src/autofill/capture";
import type { ContentRequest, ContentResponse } from "../src/autofill/contentHandler";
import type { PanelToSW, SWToPanel } from "../src/autofill/sidepanelMessages";
import type { FieldDescriptor, FieldKind } from "../src/autofill/types";
import { getSettings } from "../src/data/settingsRepo";
import { getProfile } from "../src/data/profileRepo";
import { createApplication, listApplications } from "../src/data/applicationRepo";
import { createLLMClient } from "../src/llm/factory";

export default defineBackground(() => {
  let state: RunState = initialRunState();
  let activeTabId: number | null = null;
  let captured = false; // guard: auto-capture at most once per run

  browser.runtime.onInstalled.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL("/dashboard.html") });
  });

  // Open the side panel when the toolbar icon is clicked.
  browser.action.onClicked.addListener((tab) => {
    if (tab.id != null) {
      activeTabId = tab.id;
      void chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  function pushState(): void {
    const msg: SWToPanel = {
      type: "PANEL_STATE", phase: state.phase, fills: state.fills,
      checkpoints: state.checkpoints, screen: state.screen, error: state.error,
    };
    void chrome.runtime.sendMessage(msg);
  }

  function dispatch(event: Parameters<typeof runReducer>[1]): void {
    state = runReducer(state, event);
    pushState();
    void drive();
  }

  async function content(req: ContentRequest): Promise<ContentResponse> {
    if (activeTabId == null) throw new Error("no active tab");
    return (await browser.tabs.sendMessage(activeTabId, req)) as ContentResponse;
  }

  // Translate the current phase into the next side effect.
  async function drive(): Promise<void> {
    try {
      if (state.phase === "extracting") {
        const res = await content({ type: "EXTRACT" });
        if (res.type === "FIELDS") dispatch({ type: "FIELDS_EXTRACTED", fields: res.fields });
        return;
      }
      if (state.phase === "planning") {
        await runPlanner(state.fields);
        return;
      }
      if (state.phase === "filling") {
        await content({ type: "APPLY", fills: state.fills.map(mapFill) });
        dispatch({ type: "FILLS_APPLIED" });
        return;
      }
      if (state.phase === "advancing") {
        const res = await content({ type: "ADVANCE" });
        if (res.type === "ADVANCED") {
          dispatch(res.submit ? { type: "SUBMIT_DETECTED" } : { type: "ADVANCED" });
        }
        return;
      }
      if (state.phase === "submitReady" && !captured) {
        captured = true;
        await maybeCapture(); // capture once when we hand the submit to the user
        return;
      }
    } catch (err) {
      dispatch({ type: "ABORT", reason: err instanceof Error ? err.message : String(err) });
    }
  }

  function mapFill(f: { id: string; value: string | null }): { field: FieldDescriptor; value: string } {
    const field = state.fields.find((x) => x.id === f.id)!;
    return { field, value: f.value ?? "" };
  }

  async function runPlanner(fields: FieldDescriptor[]): Promise<void> {
    const [settings, profile] = await Promise.all([getSettings(), getProfile()]);
    const client = createLLMClient(settings);
    const projection = buildProfileProjection(profile);
    const qna = profile.qnaBank;
    try {
      const plan = await planFills({ fields, projection, qna, client });
      const kinds: Record<string, FieldKind> = Object.fromEntries(fields.map((f) => [f.id, f.kind]));
      const { fills, checkpoints } = partitionPlan(plan.fields, kinds);
      const locators = checkpoints
        .map((c) => fields.find((f) => f.id === c.id)?.locator)
        .filter((x): x is string => Boolean(x));
      await content({ type: "HIGHLIGHT", checkpoints: locators });
      dispatch({ type: "PLAN_PARTITIONED", fills, checkpoints });
    } catch (err) {
      dispatch({ type: "ABORT", reason: err instanceof Error ? err.message : "planner failed" });
    }
  }

  async function maybeCapture(): Promise<void> {
    if (activeTabId == null) return;
    const tab = await browser.tabs.get(activeTabId);
    const url = tab.url ?? "";
    const host = url ? new URL(url).host : "";
    const existing = await listApplications();
    const draft = captureApplication(
      { company: host, position: "", jobUrl: url, atsType: detectAtsType(host) },
      existing, new Date().toISOString().slice(0, 10),
    );
    if (draft) await createApplication(draft);
  }

  browser.runtime.onMessage.addListener((msg: PanelToSW) => {
    if (msg?.type === "PANEL_START") {
      state = initialRunState();
      captured = false;
      dispatch({ type: "START" });
    } else if (msg?.type === "PANEL_APPROVE_ADVANCE") {
      dispatch({ type: "ADVANCE_APPROVED" });
    } else if (msg?.type === "PANEL_ABORT") {
      dispatch({ type: "ABORT", reason: "stopped by user" });
    }
  });
});
```

> **Note on the screenshot pass:** the spec's one-pass `needsVisual` re-plan uses `chrome.tabs.captureVisibleTab` cropped to field rects. Wire it inside `runPlanner` only if any returned field has `needsVisual === true`: capture, crop to the union of those rects, and re-call `planFills` with `images: [croppedBase64]` for just those fields. This is glue verified in the manual run; keep the DOM-only path as the default so a missing/denied capture degrades to treating those fields as checkpoints.

- [ ] **Step 3: Run the full unit suite + build**

Run: `pnpm test`
Expected: all Slice 1 + Slice 2 unit tests pass.

Run: `pnpm build`
Expected: WXT builds `dashboard.html`, `sidepanel.html`, `content` script, and `background` with no type errors.

- [ ] **Step 4: Manual end-to-end verification**

1. `pnpm dev`; load the unpacked extension; ensure a profile is set up (from Slice 1) and an API key is saved in Settings.
2. Open any multi-field form (a public Greenhouse/Lever posting, or a local test HTML form).
3. Click the extension icon → the **side panel** opens. Click **Start auto-fill**.
4. Confirm: confident fields fill and highlight green; ambiguous/file fields highlight amber and appear under **Needs you** in the panel.
5. Click **Approve & continue** → the panel announces advancing; a Next button is clicked; the next screen is processed.
6. On a final step, confirm the panel shows **"Submit is yours"** and the submit button is **not** clicked automatically.
7. Submit manually; confirm a new row appears in the dashboard (auto-capture), and that re-running on the same URL does **not** create a duplicate.

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/entrypoints/background.ts job-application-assistant/wxt.config.ts
git commit -m "feat: wire service-worker orchestration host, side panel, and manifest"
```

---

## Spec Coverage Notes

- **Covered:** hybrid perception (DOM `extractFields` + image-capable LLM client + `needsVisual` re-plan path), side-panel control surface, manual file checkpoints (executor never touches `file`; partition routes them to checkpoints), deferred free-text generation (planner fills from projection/Q&A only; unmatched → checkpoint), auto-advance with checkpoints + submit hard-stop (`navigate` + orchestrator + content handler), 0.8 confidence gate, `atsPatterns` store, auto-capture with de-dup, the run-state machine, and the pure-logic test strategy.
- **Deferred (per spec "Out of scope"):** LLM-drafted free-text answers, resume/file auto-attach + Blob storage, fully custom/canvas widgets beyond the screenshot fallback, Gmail (Slice 3), OAuth LLM backend. The `atsPatterns.mergePattern` write-back from successful runs is available but only wired opportunistically; broader pattern learning is a later enhancement.
