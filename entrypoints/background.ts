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
