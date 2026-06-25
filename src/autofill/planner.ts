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
