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
