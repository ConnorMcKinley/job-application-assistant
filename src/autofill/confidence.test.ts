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
