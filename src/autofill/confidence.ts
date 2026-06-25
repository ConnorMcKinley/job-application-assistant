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
