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
