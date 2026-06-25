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
