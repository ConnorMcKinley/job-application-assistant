import { describe, it, expect } from "vitest";
import { initialRunState, runReducer } from "./orchestrator";
import type { FieldDescriptor, FillPlanField } from "./types";

const field: FieldDescriptor = { id: "a", locator: "#a", label: "A", kind: "text",
  required: false, rect: { x: 0, y: 0, w: 0, h: 0 }, readable: true };
const fill: FillPlanField = { id: "a", value: "x", confidence: 0.9, source: "profile", needsVisual: false, reason: "" };
const fill2: FillPlanField = { id: "b", value: "y", confidence: 0.9, source: "profile", needsVisual: false, reason: "" };

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
    expect(s.phase).toBe("filling");
    s = runReducer(s, { type: "FILLS_APPLIED" });
    expect(s.phase).toBe("checkpoint");
    s = runReducer(s, { type: "ADVANCE_APPROVED" });
    expect(s.phase).toBe("advancing");
  });

  it("applies fills before halting when a screen has both fills and checkpoints", () => {
    let s = runReducer(initialRunState(), { type: "START" });
    s = runReducer(s, { type: "FIELDS_EXTRACTED", fields: [field] });
    s = runReducer(s, { type: "PLAN_PARTITIONED", fills: [fill], checkpoints: [fill2] });
    expect(s.phase).toBe("filling");
    expect(s.fills).toHaveLength(1);
    expect(s.checkpoints).toHaveLength(1);
    s = runReducer(s, { type: "FILLS_APPLIED" });
    expect(s.phase).toBe("checkpoint");
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
