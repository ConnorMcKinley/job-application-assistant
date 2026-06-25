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
        phase: "filling",
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
