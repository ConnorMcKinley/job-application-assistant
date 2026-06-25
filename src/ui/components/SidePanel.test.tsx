import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidePanel } from "./SidePanel";
import type { SWToPanel } from "../../autofill/sidepanelMessages";

function state(over: Partial<SWToPanel>): SWToPanel {
  return { type: "PANEL_STATE", phase: "idle", fills: [], checkpoints: [], screen: 0, error: null, ...over };
}

describe("SidePanel", () => {
  it("shows Start when idle and fires onStart", async () => {
    const onStart = vi.fn();
    render(<SidePanel state={state({ phase: "idle" })} onStart={onStart} onApprove={() => {}} onAbort={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /start/i }));
    expect(onStart).toHaveBeenCalled();
  });

  it("shows the checkpoint list and an approve button", async () => {
    const onApprove = vi.fn();
    render(
      <SidePanel
        state={state({ phase: "checkpoint",
          checkpoints: [{ id: "salary", value: null, confidence: 0.3, source: "inferred", needsVisual: false, reason: "Needs your input" }] })}
        onStart={() => {}} onApprove={onApprove} onAbort={() => {}} />,
    );
    expect(screen.getByText(/needs your input/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /approve & continue/i }));
    expect(onApprove).toHaveBeenCalled();
  });

  it("shows the submit-is-yours banner at submitReady", () => {
    render(<SidePanel state={state({ phase: "submitReady" })} onStart={() => {}} onApprove={() => {}} onAbort={() => {}} />);
    expect(screen.getByText(/submit is yours/i)).toBeInTheDocument();
  });
});
