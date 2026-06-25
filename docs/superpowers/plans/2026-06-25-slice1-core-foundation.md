# Slice 1: Core Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local data foundation, dashboard, and profile setup wizard for the Job Application Assistant browser extension — a self-contained, usable manual application tracker that every later slice writes to.

**Architecture:** A single Chrome/Edge MV3 extension built with WXT. All data lives locally in IndexedDB via a typed Dexie repository layer. A React full-page dashboard tab renders a sortable application list and an add/edit form. A first-run profile setup wizard captures the user's grouped profile data. An `LLMClient` interface with an API-key backend is scaffolded (no UI consumers yet in this slice) so later slices can plug in.

**Tech Stack:** WXT, React 18, TypeScript (strict), Dexie 4 (IndexedDB), Vitest, @testing-library/react, fake-indexeddb, pnpm, Node 20+.

## Global Constraints

- Runtime/build: **WXT** extension framework, **Manifest V3**, target Chrome/Edge.
- Language: **TypeScript strict mode** (`"strict": true`). No `any` in committed code.
- React **18** function components + hooks only.
- Persistence: **Dexie 4** over IndexedDB. No other storage engine. Tests use **fake-indexeddb**.
- Test runner: **Vitest** with **jsdom** environment; component tests use **@testing-library/react**.
- Package manager: **pnpm**. Node **>=20**.
- All data is **local to the browser**. No network calls in Slice 1 except inside `ApiKeyLLMClient`, which is unit-tested only with a mocked `fetch` (never hits the real API in tests).
- `status` enum values, verbatim: `saved`, `applied`, `action_needed`, `under_review`, `interview`, `offer`, `accepted`, `rejected`, `withdrawn`.
- `location.type` values, verbatim: `onsite`, `remote`, `hybrid`.
- Every code change is committed at the end of its task with a `feat:`/`test:`/`chore:` message.

---

## File Structure

```
job-application-assistant/
  package.json                       # pnpm + scripts (Task 1)
  wxt.config.ts                      # WXT config (Task 1)
  tsconfig.json                      # strict TS (Task 1)
  vitest.config.ts                   # vitest jsdom + setup (Task 1)
  vitest.setup.ts                    # fake-indexeddb + RTL cleanup (Task 1)
  src/
    models/
      types.ts                       # Application, Profile, Settings, enums (Task 2)
    data/
      db.ts                          # Dexie schema/instance (Task 2)
      applicationRepo.ts             # Application CRUD (Task 3)
      applicationRepo.test.ts
      profileRepo.ts                 # Profile get/update (Task 4)
      profileRepo.test.ts
      settingsRepo.ts                # Settings get/update (Task 5)
      settingsRepo.test.ts
    llm/
      LLMClient.ts                   # interface + types (Task 6)
      apiKeyClient.ts                # ApiKeyLLMClient (Task 6)
      apiKeyClient.test.ts
      factory.ts                     # createLLMClient(settings) (Task 6)
      factory.test.ts
    ui/
      hooks/
        useApplications.ts           # live query hook (Task 7)
      sort.ts                        # pure sort helper (Task 7)
      sort.test.ts
      components/
        ApplicationList.tsx          # sortable table (Task 8)
        ApplicationList.test.tsx
        ApplicationForm.tsx          # add/edit form (Task 9)
        ApplicationForm.test.tsx
        ProfileWizard.tsx            # grouped setup wizard (Task 10)
        ProfileWizard.test.tsx
        Dashboard.tsx                # shell: wizard gate + list/form (Task 11)
        Dashboard.test.tsx
  entrypoints/
    dashboard/
      index.html                     # full-page tab (Task 1, wired Task 11)
      main.tsx                       # React mount (Task 11)
    background.ts                    # opens dashboard on install (Task 11)
```

---

### Task 1: Project scaffold + test harness

**Files:**
- Create: `job-application-assistant/package.json`
- Create: `job-application-assistant/wxt.config.ts`
- Create: `job-application-assistant/tsconfig.json`
- Create: `job-application-assistant/vitest.config.ts`
- Create: `job-application-assistant/vitest.setup.ts`
- Create: `job-application-assistant/entrypoints/dashboard/index.html`
- Create: `job-application-assistant/src/sanity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `pnpm test` command and a buildable WXT project. No exported code symbols.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "job-application-assistant",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "postinstall": "wxt prepare",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "dexie": "^4.0.8",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@wxt-dev/module-react": "^1.1.0",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.3",
    "vitest": "^2.0.0",
    "wxt": "^0.19.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  }
}
```

- [ ] **Step 3: Create `wxt.config.ts`**

```typescript
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Job Application Assistant",
    permissions: ["storage"],
  },
});
```

- [ ] **Step 4: Create `entrypoints/dashboard/index.html`** (full mount markup; `main.tsx` is stubbed here and replaced in Task 11)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Job Application Assistant</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4b: Create stub `entrypoints/dashboard/main.tsx`** (so `wxt prepare` resolves the entrypoint; replaced in Task 11)

```typescript
const root = document.getElementById("root");
if (root) {
  root.textContent = "Loading…";
}
```

- [ ] **Step 5: Create `vitest.setup.ts`**

```typescript
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 6: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

- [ ] **Step 7: Write the sanity test `src/sanity.test.ts`**

```typescript
import { describe, it, expect } from "vitest";

describe("harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Install and run**

Run: `cd job-application-assistant && pnpm install && pnpm test`
Expected: 1 passing test (`harness > runs`).

- [ ] **Step 9: Commit**

```bash
git add job-application-assistant
git commit -m "chore: scaffold WXT extension + vitest harness"
```

---

### Task 2: Data model types + Dexie schema

**Files:**
- Create: `job-application-assistant/src/models/types.ts`
- Create: `job-application-assistant/src/data/db.ts`
- Test: `job-application-assistant/src/data/db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ApplicationStatus` (union of the 9 status strings), `LocationType` (`"onsite" | "remote" | "hybrid"`).
  - `Application` interface: `{ id?: number; company: string; position: string; location: { type: LocationType; place: string }; jobUrl: string; atsType: string; appliedDate: string; status: ApplicationStatus; linkedEmails: string[]; recruiterContacts: string[]; notes: string; createdAt: string; updatedAt: string }`.
  - `Profile` interface (grouped fields, see code) with fixed `id: 1`.
  - `Settings` interface: `{ id: 1; llmBackend: "apiKey" | "oauth"; apiKey: string; setupComplete: boolean }`.
  - `db` — a Dexie instance with tables `applications`, `profile`, `settings`.

- [ ] **Step 1: Write the failing test `src/data/db.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";

describe("db", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("exposes the three tables", () => {
    expect(db.applications).toBeDefined();
    expect(db.profile).toBeDefined();
    expect(db.settings).toBeDefined();
  });

  it("auto-increments application ids", async () => {
    const id = await db.applications.add({
      company: "Acme",
      position: "SWE",
      location: { type: "remote", place: "" },
      jobUrl: "https://acme.test/job",
      atsType: "greenhouse",
      appliedDate: "2026-06-25",
      status: "applied",
      linkedEmails: [],
      recruiterContacts: [],
      notes: "",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    });
    expect(typeof id).toBe("number");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/data/db.test.ts`
Expected: FAIL — cannot resolve `./db`.

- [ ] **Step 3: Create `src/models/types.ts`**

```typescript
export type ApplicationStatus =
  | "saved"
  | "applied"
  | "action_needed"
  | "under_review"
  | "interview"
  | "offer"
  | "accepted"
  | "rejected"
  | "withdrawn";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "action_needed",
  "under_review",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

export type LocationType = "onsite" | "remote" | "hybrid";
export const LOCATION_TYPES: LocationType[] = ["onsite", "remote", "hybrid"];

export interface Application {
  id?: number;
  company: string;
  position: string;
  location: { type: LocationType; place: string };
  jobUrl: string;
  atsType: string;
  appliedDate: string; // ISO date (YYYY-MM-DD)
  status: ApplicationStatus;
  linkedEmails: string[];
  recruiterContacts: string[];
  notes: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface EducationEntry {
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface QnAEntry {
  question: string;
  answer: string;
}

export interface Profile {
  id: 1;
  personal: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    linkedin: string;
    github: string;
    portfolio: string;
  };
  education: EducationEntry[];
  experience: ExperienceEntry[];
  workAuth: {
    needsSponsorship: boolean;
    veteranStatus: string;
    disabilityStatus: string;
    demographics: string;
  };
  documents: {
    resumeFileName: string;
    coverLetterTemplate: string;
  };
  preferences: {
    desiredSalary: string;
    desiredLocations: string;
    startDate: string;
    willingToRelocate: boolean;
  };
  qnaBank: QnAEntry[];
}

export interface Settings {
  id: 1;
  llmBackend: "apiKey" | "oauth";
  apiKey: string;
  setupComplete: boolean;
}

export function emptyProfile(): Profile {
  return {
    id: 1,
    personal: { fullName: "", email: "", phone: "", address: "", linkedin: "", github: "", portfolio: "" },
    education: [],
    experience: [],
    workAuth: { needsSponsorship: false, veteranStatus: "", disabilityStatus: "", demographics: "" },
    documents: { resumeFileName: "", coverLetterTemplate: "" },
    preferences: { desiredSalary: "", desiredLocations: "", startDate: "", willingToRelocate: false },
    qnaBank: [],
  };
}

export function defaultSettings(): Settings {
  return { id: 1, llmBackend: "apiKey", apiKey: "", setupComplete: false };
}
```

- [ ] **Step 4: Create `src/data/db.ts`**

```typescript
import Dexie, { type EntityTable } from "dexie";
import type { Application, Profile, Settings } from "../models/types";

const database = new Dexie("JobApplicationAssistant") as Dexie & {
  applications: EntityTable<Application, "id">;
  profile: EntityTable<Profile, "id">;
  settings: EntityTable<Settings, "id">;
};

database.version(1).stores({
  applications: "++id, company, status, appliedDate",
  profile: "id",
  settings: "id",
});

export const db = database;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/data/db.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add job-application-assistant/src/models/types.ts job-application-assistant/src/data/db.ts job-application-assistant/src/data/db.test.ts
git commit -m "feat: add data model types and Dexie schema"
```

---

### Task 3: Application repository (CRUD)

**Files:**
- Create: `job-application-assistant/src/data/applicationRepo.ts`
- Test: `job-application-assistant/src/data/applicationRepo.test.ts`

**Interfaces:**
- Consumes: `db` (Task 2), `Application` (Task 2).
- Produces:
  - `createApplication(input: NewApplication): Promise<number>` where `NewApplication = Omit<Application, "id" | "createdAt" | "updatedAt">`. Stamps `createdAt`/`updatedAt`.
  - `listApplications(): Promise<Application[]>`.
  - `getApplication(id: number): Promise<Application | undefined>`.
  - `updateApplication(id: number, changes: Partial<NewApplication>): Promise<void>` — re-stamps `updatedAt`.
  - `deleteApplication(id: number): Promise<void>`.

- [ ] **Step 1: Write the failing test `src/data/applicationRepo.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import {
  createApplication,
  listApplications,
  getApplication,
  updateApplication,
  deleteApplication,
  type NewApplication,
} from "./applicationRepo";

const sample: NewApplication = {
  company: "Acme",
  position: "SWE",
  location: { type: "remote", place: "" },
  jobUrl: "https://acme.test/job",
  atsType: "greenhouse",
  appliedDate: "2026-06-25",
  status: "applied",
  linkedEmails: [],
  recruiterContacts: [],
  notes: "",
};

describe("applicationRepo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates and lists applications", async () => {
    const id = await createApplication(sample);
    const all = await listApplications();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(id);
    expect(all[0]!.company).toBe("Acme");
    expect(all[0]!.createdAt).not.toBe("");
  });

  it("updates an application and re-stamps updatedAt", async () => {
    const id = await createApplication(sample);
    const before = await getApplication(id);
    await new Promise((r) => setTimeout(r, 2));
    await updateApplication(id, { status: "interview" });
    const after = await getApplication(id);
    expect(after!.status).toBe("interview");
    expect(after!.updatedAt).not.toBe(before!.updatedAt);
  });

  it("deletes an application", async () => {
    const id = await createApplication(sample);
    await deleteApplication(id);
    expect(await getApplication(id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/data/applicationRepo.test.ts`
Expected: FAIL — cannot resolve `./applicationRepo`.

- [ ] **Step 3: Create `src/data/applicationRepo.ts`**

```typescript
import { db } from "./db";
import type { Application } from "../models/types";

export type NewApplication = Omit<Application, "id" | "createdAt" | "updatedAt">;

export async function createApplication(input: NewApplication): Promise<number> {
  const now = new Date().toISOString();
  return db.applications.add({ ...input, createdAt: now, updatedAt: now });
}

export async function listApplications(): Promise<Application[]> {
  return db.applications.toArray();
}

export async function getApplication(id: number): Promise<Application | undefined> {
  return db.applications.get(id);
}

export async function updateApplication(
  id: number,
  changes: Partial<NewApplication>,
): Promise<void> {
  await db.applications.update(id, { ...changes, updatedAt: new Date().toISOString() });
}

export async function deleteApplication(id: number): Promise<void> {
  await db.applications.delete(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/data/applicationRepo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/data/applicationRepo.ts job-application-assistant/src/data/applicationRepo.test.ts
git commit -m "feat: add application repository CRUD"
```

---

### Task 4: Profile repository

**Files:**
- Create: `job-application-assistant/src/data/profileRepo.ts`
- Test: `job-application-assistant/src/data/profileRepo.test.ts`

**Interfaces:**
- Consumes: `db` (Task 2), `Profile`, `emptyProfile` (Task 2).
- Produces:
  - `getProfile(): Promise<Profile>` — returns the stored profile or `emptyProfile()` if none exists (never throws on first run).
  - `saveProfile(profile: Profile): Promise<void>` — upserts the singleton row (`id: 1`).

- [ ] **Step 1: Write the failing test `src/data/profileRepo.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { getProfile, saveProfile } from "./profileRepo";
import { emptyProfile } from "../models/types";

describe("profileRepo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("returns an empty profile when none stored", async () => {
    const p = await getProfile();
    expect(p.id).toBe(1);
    expect(p.personal.fullName).toBe("");
  });

  it("saves and reloads a profile", async () => {
    const p = emptyProfile();
    p.personal.fullName = "Connor McKinley";
    await saveProfile(p);
    const loaded = await getProfile();
    expect(loaded.personal.fullName).toBe("Connor McKinley");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/data/profileRepo.test.ts`
Expected: FAIL — cannot resolve `./profileRepo`.

- [ ] **Step 3: Create `src/data/profileRepo.ts`**

```typescript
import { db } from "./db";
import { emptyProfile, type Profile } from "../models/types";

export async function getProfile(): Promise<Profile> {
  const stored = await db.profile.get(1);
  return stored ?? emptyProfile();
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put({ ...profile, id: 1 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/data/profileRepo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/data/profileRepo.ts job-application-assistant/src/data/profileRepo.test.ts
git commit -m "feat: add profile repository"
```

---

### Task 5: Settings repository

**Files:**
- Create: `job-application-assistant/src/data/settingsRepo.ts`
- Test: `job-application-assistant/src/data/settingsRepo.test.ts`

**Interfaces:**
- Consumes: `db` (Task 2), `Settings`, `defaultSettings` (Task 2).
- Produces:
  - `getSettings(): Promise<Settings>` — stored row or `defaultSettings()`.
  - `saveSettings(settings: Settings): Promise<void>` — upserts singleton (`id: 1`).
  - `markSetupComplete(): Promise<void>` — sets `setupComplete: true`.

- [ ] **Step 1: Write the failing test `src/data/settingsRepo.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { getSettings, saveSettings, markSetupComplete } from "./settingsRepo";
import { defaultSettings } from "../models/types";

describe("settingsRepo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("defaults setupComplete to false", async () => {
    const s = await getSettings();
    expect(s.setupComplete).toBe(false);
    expect(s.llmBackend).toBe("apiKey");
  });

  it("persists settings", async () => {
    const s = defaultSettings();
    s.apiKey = "sk-test";
    await saveSettings(s);
    expect((await getSettings()).apiKey).toBe("sk-test");
  });

  it("marks setup complete", async () => {
    await markSetupComplete();
    expect((await getSettings()).setupComplete).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/data/settingsRepo.test.ts`
Expected: FAIL — cannot resolve `./settingsRepo`.

- [ ] **Step 3: Create `src/data/settingsRepo.ts`**

```typescript
import { db } from "./db";
import { defaultSettings, type Settings } from "../models/types";

export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get(1);
  return stored ?? defaultSettings();
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put({ ...settings, id: 1 });
}

export async function markSetupComplete(): Promise<void> {
  const current = await getSettings();
  await saveSettings({ ...current, setupComplete: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/data/settingsRepo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/data/settingsRepo.ts job-application-assistant/src/data/settingsRepo.test.ts
git commit -m "feat: add settings repository"
```

---

### Task 6: LLMClient scaffold (interface + API-key backend + factory)

**Files:**
- Create: `job-application-assistant/src/llm/LLMClient.ts`
- Create: `job-application-assistant/src/llm/apiKeyClient.ts`
- Test: `job-application-assistant/src/llm/apiKeyClient.test.ts`
- Create: `job-application-assistant/src/llm/factory.ts`
- Test: `job-application-assistant/src/llm/factory.test.ts`

**Interfaces:**
- Consumes: `Settings` (Task 2).
- Produces:
  - `LLMMessage = { role: "user" | "assistant"; content: string }`.
  - `LLMClient` interface: `{ complete(messages: LLMMessage[], opts?: { system?: string; maxTokens?: number }): Promise<string> }`.
  - `ApiKeyLLMClient` class implementing `LLMClient`, constructed with `(apiKey: string, fetchFn?: typeof fetch)`. Calls Anthropic Messages API with header `anthropic-dangerous-direct-browser-access: true`, model `claude-sonnet-4-6`, and returns the concatenated text blocks.
  - `createLLMClient(settings: Settings): LLMClient` — returns an `ApiKeyLLMClient` for `llmBackend: "apiKey"`; throws `Error("OAuth backend not implemented in Slice 1")` for `"oauth"`.

> **Note:** No UI consumes the LLM in Slice 1. This task only proves the seam exists and the API-key path is shaped correctly. Tests inject a mock `fetch`; they never hit the network.

- [ ] **Step 1: Create the interface `src/llm/LLMClient.ts`**

```typescript
export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMCompleteOptions {
  system?: string;
  maxTokens?: number;
}

export interface LLMClient {
  complete(messages: LLMMessage[], opts?: LLMCompleteOptions): Promise<string>;
}
```

- [ ] **Step 2: Write the failing test `src/llm/apiKeyClient.test.ts`**

```typescript
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
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/llm/apiKeyClient.test.ts`
Expected: FAIL — cannot resolve `./apiKeyClient`.

- [ ] **Step 4: Create `src/llm/apiKeyClient.ts`**

```typescript
import type { LLMClient, LLMCompleteOptions, LLMMessage } from "./LLMClient";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

interface AnthropicContentBlock {
  type: string;
  text?: string;
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
        messages,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status}`);
    }

    const data = (await res.json()) as { content: AnthropicContentBlock[] };
    return data.content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/llm/apiKeyClient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the failing test `src/llm/factory.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { createLLMClient } from "./factory";
import { ApiKeyLLMClient } from "./apiKeyClient";
import { defaultSettings } from "../models/types";

describe("createLLMClient", () => {
  it("returns an ApiKeyLLMClient for the apiKey backend", () => {
    const client = createLLMClient({ ...defaultSettings(), apiKey: "sk-x" });
    expect(client).toBeInstanceOf(ApiKeyLLMClient);
  });

  it("throws for the oauth backend in Slice 1", () => {
    expect(() => createLLMClient({ ...defaultSettings(), llmBackend: "oauth" })).toThrow(
      /OAuth backend not implemented/,
    );
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm test src/llm/factory.test.ts`
Expected: FAIL — cannot resolve `./factory`.

- [ ] **Step 8: Create `src/llm/factory.ts`**

```typescript
import type { Settings } from "../models/types";
import type { LLMClient } from "./LLMClient";
import { ApiKeyLLMClient } from "./apiKeyClient";

export function createLLMClient(settings: Settings): LLMClient {
  if (settings.llmBackend === "apiKey") {
    return new ApiKeyLLMClient(settings.apiKey);
  }
  throw new Error("OAuth backend not implemented in Slice 1");
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm test src/llm/factory.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add job-application-assistant/src/llm
git commit -m "feat: scaffold LLMClient interface, API-key backend, and factory"
```

---

### Task 7: Sort helper + live applications hook

**Files:**
- Create: `job-application-assistant/src/ui/sort.ts`
- Test: `job-application-assistant/src/ui/sort.test.ts`
- Create: `job-application-assistant/src/ui/hooks/useApplications.ts`

**Interfaces:**
- Consumes: `Application` (Task 2), `listApplications` (Task 3), `db` (Task 2).
- Produces:
  - `SortKey = "company" | "position" | "appliedDate" | "status"`; `SortDir = "asc" | "desc"`.
  - `sortApplications(apps: Application[], key: SortKey, dir: SortDir): Application[]` — pure, returns a new array, case-insensitive for strings.
  - `useApplications(): { apps: Application[]; reload: () => void }` — loads on mount via `listApplications`, exposes `reload`.

> **Note:** `useApplications` uses a manual `reload` rather than Dexie live-queries to keep Slice 1 dependency-light; component tests call `reload` after mutations.

- [ ] **Step 1: Write the failing test `src/ui/sort.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { sortApplications } from "./sort";
import type { Application } from "../models/types";

function app(over: Partial<Application>): Application {
  return {
    id: 1, company: "", position: "", location: { type: "remote", place: "" },
    jobUrl: "", atsType: "", appliedDate: "2026-01-01", status: "applied",
    linkedEmails: [], recruiterContacts: [], notes: "",
    createdAt: "", updatedAt: "", ...over,
  };
}

describe("sortApplications", () => {
  it("sorts by company ascending, case-insensitive", () => {
    const out = sortApplications(
      [app({ company: "zeta" }), app({ company: "Alpha" })],
      "company",
      "asc",
    );
    expect(out.map((a) => a.company)).toEqual(["Alpha", "zeta"]);
  });

  it("sorts by appliedDate descending", () => {
    const out = sortApplications(
      [app({ appliedDate: "2026-01-01" }), app({ appliedDate: "2026-06-01" })],
      "appliedDate",
      "desc",
    );
    expect(out.map((a) => a.appliedDate)).toEqual(["2026-06-01", "2026-01-01"]);
  });

  it("does not mutate the input array", () => {
    const input = [app({ company: "b" }), app({ company: "a" })];
    sortApplications(input, "company", "asc");
    expect(input.map((a) => a.company)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/ui/sort.test.ts`
Expected: FAIL — cannot resolve `./sort`.

- [ ] **Step 3: Create `src/ui/sort.ts`**

```typescript
import type { Application } from "../models/types";

export type SortKey = "company" | "position" | "appliedDate" | "status";
export type SortDir = "asc" | "desc";

export function sortApplications(
  apps: Application[],
  key: SortKey,
  dir: SortDir,
): Application[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...apps].sort((a, b) => {
    const av = String(a[key]).toLowerCase();
    const bv = String(b[key]).toLowerCase();
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return 0;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/ui/sort.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `src/ui/hooks/useApplications.ts`**

```typescript
import { useCallback, useEffect, useState } from "react";
import type { Application } from "../../models/types";
import { listApplications } from "../../data/applicationRepo";

export function useApplications(): { apps: Application[]; reload: () => void } {
  const [apps, setApps] = useState<Application[]>([]);

  const reload = useCallback(() => {
    void listApplications().then(setApps);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { apps, reload };
}
```

- [ ] **Step 6: Commit**

```bash
git add job-application-assistant/src/ui/sort.ts job-application-assistant/src/ui/sort.test.ts job-application-assistant/src/ui/hooks/useApplications.ts
git commit -m "feat: add sort helper and useApplications hook"
```

---

### Task 8: ApplicationList (sortable table)

**Files:**
- Create: `job-application-assistant/src/ui/components/ApplicationList.tsx`
- Test: `job-application-assistant/src/ui/components/ApplicationList.test.tsx`

**Interfaces:**
- Consumes: `Application` (Task 2), `sortApplications`, `SortKey`, `SortDir` (Task 7).
- Produces:
  - `ApplicationList` component with props `{ apps: Application[]; onEdit: (app: Application) => void; onDelete: (id: number) => void }`. Renders a table with clickable column headers (`Company`, `Position`, `Location`, `Status`, `Applied`) that toggle sort. Each row has Edit and Delete buttons. Location renders as `type` plus `place` when present (e.g., `hybrid · NYC`).

- [ ] **Step 1: Write the failing test `src/ui/components/ApplicationList.test.tsx`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationList } from "./ApplicationList";
import type { Application } from "../../models/types";

function app(over: Partial<Application>): Application {
  return {
    id: 1, company: "", position: "SWE", location: { type: "remote", place: "" },
    jobUrl: "", atsType: "", appliedDate: "2026-01-01", status: "applied",
    linkedEmails: [], recruiterContacts: [], notes: "", createdAt: "", updatedAt: "", ...over,
  };
}

describe("ApplicationList", () => {
  it("renders a row per application", () => {
    render(
      <ApplicationList
        apps={[app({ id: 1, company: "Acme" }), app({ id: 2, company: "Beta" })]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("toggles sort order when a header is clicked", async () => {
    render(
      <ApplicationList
        apps={[app({ id: 1, company: "Zeta" }), app({ id: 2, company: "Alpha" })]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // default: company asc -> Alpha first
    let rows = screen.getAllByRole("row").slice(1); // skip header
    expect(within(rows[0]!).getByText("Alpha")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /company/i }));
    rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Zeta")).toBeInTheDocument();
  });

  it("invokes onDelete with the row id", async () => {
    const onDelete = vi.fn();
    render(<ApplicationList apps={[app({ id: 7, company: "Acme" })]} onEdit={() => {}} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/ui/components/ApplicationList.test.tsx`
Expected: FAIL — cannot resolve `./ApplicationList`.

- [ ] **Step 3: Create `src/ui/components/ApplicationList.tsx`**

```typescript
import { useState } from "react";
import type { Application } from "../../models/types";
import { sortApplications, type SortDir, type SortKey } from "../sort";

interface Props {
  apps: Application[];
  onEdit: (app: Application) => void;
  onDelete: (id: number) => void;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "position", label: "Position" },
  { key: "status", label: "Status" },
  { key: "appliedDate", label: "Applied" },
];

function locationLabel(app: Application): string {
  return app.location.place ? `${app.location.type} · ${app.location.place}` : app.location.type;
}

export function ApplicationList({ apps, onEdit, onDelete }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("company");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = sortApplications(apps, sortKey, sortDir);

  return (
    <table>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c.key}>
              <button type="button" onClick={() => toggle(c.key)}>
                {c.label}
                {sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </button>
            </th>
          ))}
          <th>Location</th>
          <th>Link</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((a) => (
          <tr key={a.id}>
            <td>{a.company}</td>
            <td>{a.position}</td>
            <td>{a.status}</td>
            <td>{a.appliedDate}</td>
            <td>{locationLabel(a)}</td>
            <td>
              {a.jobUrl ? (
                <a href={a.jobUrl} target="_blank" rel="noreferrer">
                  open
                </a>
              ) : null}
            </td>
            <td>
              <button type="button" onClick={() => onEdit(a)}>
                Edit
              </button>
              <button type="button" onClick={() => onDelete(a.id!)}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/ui/components/ApplicationList.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/ui/components/ApplicationList.tsx job-application-assistant/src/ui/components/ApplicationList.test.tsx
git commit -m "feat: add sortable ApplicationList component"
```

---

### Task 9: ApplicationForm (add/edit)

**Files:**
- Create: `job-application-assistant/src/ui/components/ApplicationForm.tsx`
- Test: `job-application-assistant/src/ui/components/ApplicationForm.test.tsx`

**Interfaces:**
- Consumes: `Application`, `NewApplication` (Task 3), `APPLICATION_STATUSES`, `LOCATION_TYPES` (Task 2).
- Produces:
  - `ApplicationForm` component with props `{ initial?: Application; onSubmit: (values: NewApplication) => void; onCancel: () => void }`. Controlled inputs for company, position, location type (select), location place, jobUrl, appliedDate, status (select), notes. Pre-fills from `initial` when editing. Calls `onSubmit` with a `NewApplication` (no id/timestamps), defaulting `linkedEmails`/`recruiterContacts`/`atsType` from `initial` or empty.

- [ ] **Step 1: Write the failing test `src/ui/components/ApplicationForm.test.tsx`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationForm } from "./ApplicationForm";

describe("ApplicationForm", () => {
  it("submits entered values as a NewApplication", async () => {
    const onSubmit = vi.fn();
    render(<ApplicationForm onSubmit={onSubmit} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText(/company/i), "Acme");
    await userEvent.type(screen.getByLabelText(/position/i), "SWE");
    await userEvent.selectOptions(screen.getByLabelText(/location type/i), "hybrid");
    await userEvent.type(screen.getByLabelText(/location place/i), "NYC");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0]![0];
    expect(values.company).toBe("Acme");
    expect(values.position).toBe("SWE");
    expect(values.location).toEqual({ type: "hybrid", place: "NYC" });
    expect(values.id).toBeUndefined();
  });

  it("pre-fills fields when editing", () => {
    render(
      <ApplicationForm
        initial={{
          id: 3, company: "Beta", position: "PM", location: { type: "onsite", place: "SF" },
          jobUrl: "https://b.test", atsType: "lever", appliedDate: "2026-02-02", status: "interview",
          linkedEmails: [], recruiterContacts: [], notes: "n", createdAt: "", updatedAt: "",
        }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText(/company/i)).toHaveValue("Beta");
    expect(screen.getByLabelText(/status/i)).toHaveValue("interview");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/ui/components/ApplicationForm.test.tsx`
Expected: FAIL — cannot resolve `./ApplicationForm`.

- [ ] **Step 3: Create `src/ui/components/ApplicationForm.tsx`**

```typescript
import { useState } from "react";
import {
  APPLICATION_STATUSES,
  LOCATION_TYPES,
  type Application,
  type ApplicationStatus,
  type LocationType,
} from "../../models/types";
import type { NewApplication } from "../../data/applicationRepo";

interface Props {
  initial?: Application;
  onSubmit: (values: NewApplication) => void;
  onCancel: () => void;
}

export function ApplicationForm({ initial, onSubmit, onCancel }: Props) {
  const [company, setCompany] = useState(initial?.company ?? "");
  const [position, setPosition] = useState(initial?.position ?? "");
  const [locType, setLocType] = useState<LocationType>(initial?.location.type ?? "remote");
  const [locPlace, setLocPlace] = useState(initial?.location.place ?? "");
  const [jobUrl, setJobUrl] = useState(initial?.jobUrl ?? "");
  const [appliedDate, setAppliedDate] = useState(initial?.appliedDate ?? "");
  const [status, setStatus] = useState<ApplicationStatus>(initial?.status ?? "applied");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      company,
      position,
      location: { type: locType, place: locPlace },
      jobUrl,
      atsType: initial?.atsType ?? "",
      appliedDate,
      status,
      linkedEmails: initial?.linkedEmails ?? [],
      recruiterContacts: initial?.recruiterContacts ?? [],
      notes,
    });
  }

  return (
    <form onSubmit={submit}>
      <label>Company<input value={company} onChange={(e) => setCompany(e.target.value)} /></label>
      <label>Position<input value={position} onChange={(e) => setPosition(e.target.value)} /></label>
      <label>
        Location type
        <select value={locType} onChange={(e) => setLocType(e.target.value as LocationType)}>
          {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label>Location place<input value={locPlace} onChange={(e) => setLocPlace(e.target.value)} /></label>
      <label>Job URL<input value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} /></label>
      <label>Applied date<input type="date" value={appliedDate} onChange={(e) => setAppliedDate(e.target.value)} /></label>
      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
          {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <button type="submit">Save</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/ui/components/ApplicationForm.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/ui/components/ApplicationForm.tsx job-application-assistant/src/ui/components/ApplicationForm.test.tsx
git commit -m "feat: add ApplicationForm add/edit component"
```

---

### Task 10: ProfileWizard (grouped setup)

**Files:**
- Create: `job-application-assistant/src/ui/components/ProfileWizard.tsx`
- Test: `job-application-assistant/src/ui/components/ProfileWizard.test.tsx`

**Interfaces:**
- Consumes: `Profile`, `emptyProfile` (Task 2).
- Produces:
  - `ProfileWizard` component with props `{ initial?: Profile; onComplete: (profile: Profile) => void }`. Multi-step: steps `Personal`, `Education`, `Experience`, `Preferences` (other groups deferred — see note). `Next`/`Back` navigation; the final step's button reads `Finish` and calls `onComplete` with the assembled `Profile`. For Slice 1, Education/Experience capture a single optional entry each (full repeatable lists deferred to a later slice).

> **Note:** Slice 1 wizard captures Personal fields fully and one optional Education + one optional Experience entry, plus Preferences. Work-auth/EEO, documents/resume parsing, and repeatable multi-entry lists are deferred to their own slices; this keeps the wizard testable and shippable now.

- [ ] **Step 1: Write the failing test `src/ui/components/ProfileWizard.test.tsx`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileWizard } from "./ProfileWizard";

describe("ProfileWizard", () => {
  it("walks steps and returns the assembled profile on finish", async () => {
    const onComplete = vi.fn();
    render(<ProfileWizard onComplete={onComplete} />);

    // Step 1: Personal
    await userEvent.type(screen.getByLabelText(/full name/i), "Connor McKinley");
    await userEvent.type(screen.getByLabelText(/^email/i), "c@example.com");
    await userEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2: Education -> skip
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    // Step 3: Experience -> skip
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    // Step 4: Preferences -> finish
    await userEvent.click(screen.getByRole("button", { name: /finish/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const profile = onComplete.mock.calls[0]![0];
    expect(profile.personal.fullName).toBe("Connor McKinley");
    expect(profile.personal.email).toBe("c@example.com");
    expect(profile.id).toBe(1);
  });

  it("can go back to a previous step", async () => {
    render(<ProfileWizard onComplete={() => {}} />);
    await userEvent.type(screen.getByLabelText(/full name/i), "X");
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByLabelText(/full name/i)).toHaveValue("X");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/ui/components/ProfileWizard.test.tsx`
Expected: FAIL — cannot resolve `./ProfileWizard`.

- [ ] **Step 3: Create `src/ui/components/ProfileWizard.tsx`**

```typescript
import { useState } from "react";
import { emptyProfile, type Profile } from "../../models/types";

interface Props {
  initial?: Profile;
  onComplete: (profile: Profile) => void;
}

const STEPS = ["Personal", "Education", "Experience", "Preferences"] as const;

export function ProfileWizard({ initial, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(initial ?? emptyProfile());

  const isLast = step === STEPS.length - 1;

  function next() {
    if (isLast) {
      onComplete(profile);
    } else {
      setStep(step + 1);
    }
  }

  function setPersonal(field: keyof Profile["personal"], value: string) {
    setProfile({ ...profile, personal: { ...profile.personal, [field]: value } });
  }

  return (
    <div>
      <h2>Setup — {STEPS[step]}</h2>

      {step === 0 && (
        <div>
          <label>Full name<input value={profile.personal.fullName} onChange={(e) => setPersonal("fullName", e.target.value)} /></label>
          <label>Email<input value={profile.personal.email} onChange={(e) => setPersonal("email", e.target.value)} /></label>
          <label>Phone<input value={profile.personal.phone} onChange={(e) => setPersonal("phone", e.target.value)} /></label>
          <label>LinkedIn<input value={profile.personal.linkedin} onChange={(e) => setPersonal("linkedin", e.target.value)} /></label>
        </div>
      )}

      {step === 1 && (
        <div>
          <label>
            School
            <input
              value={profile.education[0]?.school ?? ""}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  education: [{
                    school: e.target.value, degree: profile.education[0]?.degree ?? "",
                    field: "", startDate: "", endDate: "", gpa: "",
                  }],
                })
              }
            />
          </label>
        </div>
      )}

      {step === 2 && (
        <div>
          <label>
            Most recent title
            <input
              value={profile.experience[0]?.title ?? ""}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  experience: [{
                    company: profile.experience[0]?.company ?? "", title: e.target.value,
                    startDate: "", endDate: "", description: "",
                  }],
                })
              }
            />
          </label>
        </div>
      )}

      {step === 3 && (
        <div>
          <label>
            Desired salary
            <input
              value={profile.preferences.desiredSalary}
              onChange={(e) => setProfile({ ...profile, preferences: { ...profile.preferences, desiredSalary: e.target.value } })}
            />
          </label>
        </div>
      )}

      <div>
        {step > 0 && <button type="button" onClick={() => setStep(step - 1)}>Back</button>}
        <button type="button" onClick={next}>{isLast ? "Finish" : "Next"}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/ui/components/ProfileWizard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add job-application-assistant/src/ui/components/ProfileWizard.tsx job-application-assistant/src/ui/components/ProfileWizard.test.tsx
git commit -m "feat: add ProfileWizard setup component"
```

---

### Task 11: Dashboard shell + entrypoint wiring

**Files:**
- Create: `job-application-assistant/src/ui/components/Dashboard.tsx`
- Test: `job-application-assistant/src/ui/components/Dashboard.test.tsx`
- Modify (replace stub): `job-application-assistant/entrypoints/dashboard/main.tsx`
- Create: `job-application-assistant/entrypoints/background.ts`

**Interfaces:**
- Consumes: `useApplications` (Task 7), `ApplicationList` (Task 8), `ApplicationForm` (Task 9), `ProfileWizard` (Task 10), repos (Tasks 3–5), `getSettings`/`markSetupComplete` (Task 5), `getProfile`/`saveProfile` (Task 4).
- Produces:
  - `Dashboard` component (no props). On mount reads settings: if `!setupComplete`, renders `ProfileWizard`; on its `onComplete` it saves the profile, marks setup complete, and shows the list. Otherwise renders `ApplicationList` plus an "Add application" button that opens `ApplicationForm`; create/edit/delete call the repo then `reload()`.
  - `entrypoints/dashboard/main.tsx` mounts `<Dashboard />` into `#root`.
  - `entrypoints/background.ts` opens the dashboard tab on install.

- [ ] **Step 1: Write the failing test `src/ui/components/Dashboard.test.tsx`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "./Dashboard";
import { db } from "../../data/db";
import { markSetupComplete } from "../../data/settingsRepo";

describe("Dashboard", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("shows the setup wizard on first run", async () => {
    render(<Dashboard />);
    expect(await screen.findByText(/setup —/i)).toBeInTheDocument();
  });

  it("shows the application list after setup is complete", async () => {
    await markSetupComplete();
    render(<Dashboard />);
    expect(await screen.findByRole("button", { name: /add application/i })).toBeInTheDocument();
  });

  it("adds an application through the form", async () => {
    await markSetupComplete();
    render(<Dashboard />);
    await userEvent.click(await screen.findByRole("button", { name: /add application/i }));
    await userEvent.type(screen.getByLabelText(/company/i), "Acme");
    await userEvent.type(screen.getByLabelText(/position/i), "SWE");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/ui/components/Dashboard.test.tsx`
Expected: FAIL — cannot resolve `./Dashboard`.

- [ ] **Step 3: Create `src/ui/components/Dashboard.tsx`**

```typescript
import { useEffect, useState } from "react";
import { useApplications } from "../hooks/useApplications";
import { ApplicationList } from "./ApplicationList";
import { ApplicationForm } from "./ApplicationForm";
import { ProfileWizard } from "./ProfileWizard";
import {
  createApplication,
  updateApplication,
  deleteApplication,
  type NewApplication,
} from "../../data/applicationRepo";
import { getSettings, markSetupComplete } from "../../data/settingsRepo";
import { getProfile, saveProfile } from "../../data/profileRepo";
import type { Application, Profile } from "../../models/types";

type View = "loading" | "wizard" | "list";

export function Dashboard() {
  const [view, setView] = useState<View>("loading");
  const [editing, setEditing] = useState<Application | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { apps, reload } = useApplications();

  useEffect(() => {
    void getSettings().then((s) => setView(s.setupComplete ? "list" : "wizard"));
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

  if (view === "wizard") {
    return <ProfileWizard onComplete={(p) => void finishWizard(p)} />;
  }

  return (
    <div>
      <h1>Applications</h1>
      {showForm ? (
        <ApplicationForm
          initial={editing ?? undefined}
          onSubmit={(v) => void submitForm(v)}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/ui/components/Dashboard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Replace the stub `entrypoints/dashboard/main.tsx`**

```typescript
import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "../../src/ui/components/Dashboard";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <Dashboard />
    </React.StrictMode>,
  );
}
```

- [ ] **Step 6: Create `entrypoints/background.ts`**

```typescript
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL("/dashboard.html") });
  });
});
```

- [ ] **Step 7: Run the full test suite**

Run: `pnpm test`
Expected: all tests across Tasks 1–11 PASS.

- [ ] **Step 8: Build to confirm the extension compiles**

Run: `pnpm build`
Expected: WXT build completes with no errors; output written to `.output/`.

- [ ] **Step 9: Commit**

```bash
git add job-application-assistant/src/ui/components/Dashboard.tsx job-application-assistant/src/ui/components/Dashboard.test.tsx job-application-assistant/entrypoints/dashboard/main.tsx job-application-assistant/entrypoints/background.ts
git commit -m "feat: wire Dashboard shell, dashboard entrypoint, and background install hook"
```

---

## Manual Verification (after Task 11)

1. Run `pnpm dev`; load the dev extension (WXT prints the steps) in Chrome.
2. On install, the dashboard tab opens to the **setup wizard**. Complete it → list view appears.
3. Click **Add application**, fill company/position, Save → row appears.
4. Click a column header → sort order toggles. Click **Edit** → form pre-fills; change status, Save → row updates. Click **Delete** → row removed.
5. Reload the tab → data persists (IndexedDB), setup wizard does NOT reappear.

## Spec Coverage Notes

- **Covered by Slice 1:** local data store (IndexedDB/Dexie), dashboard sortable list, manual add/edit, status enum, location model, profile setup wizard (core groups), `LLMClient` scaffold with API-key backend + factory + swappable interface, settings (auth backend selection persisted).
- **Deferred (own slices, per architecture spec):** auto-fill engine (content script, planner, executor, auto-capture), Gmail connector (OAuth, classifier, matcher, review inbox), OAuth LLM backend implementation, resume parsing, repeatable multi-entry education/experience lists, work-auth/EEO + documents wizard steps, encryption-at-rest hardening, `ghosted` derivation.
