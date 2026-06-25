import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "./Dashboard";
import { db } from "../../data/db";
import { markSetupComplete, saveSettings } from "../../data/settingsRepo";
import { defaultSettings } from "../../models/types";

describe("Dashboard", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("shows the setup wizard on first run", async () => {
    render(<Dashboard />);
    expect(await screen.findByText(/setup —/i)).toBeInTheDocument();
  });

  it("shows the application list after setup is complete", async () => {
    await markSetupComplete();
    render(<Dashboard />);
    expect(await screen.findByRole("button", { name: /add application/i })).toBeInTheDocument();
  });

  it("adds an application through the form", async () => {
    await markSetupComplete();
    render(<Dashboard />);
    await userEvent.click(await screen.findByRole("button", { name: /add application/i }));
    await userEvent.type(screen.getByLabelText(/company/i), "Acme");
    await userEvent.type(screen.getByLabelText(/position/i), "SWE");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
  });

  it("shows the auth-gate banner until an LLM is configured", async () => {
    await markSetupComplete();
    render(<Dashboard />);
    expect(await screen.findByText(/connect an llm to enable auto-fill/i)).toBeInTheDocument();
  });

  it("opens Settings from the header", async () => {
    await markSetupComplete();
    await saveSettings({ ...defaultSettings(), apiKey: "sk-x", setupComplete: true });
    render(<Dashboard />);
    await userEvent.click(await screen.findByRole("button", { name: /settings/i }));
    expect(await screen.findByRole("heading", { name: /^settings$/i })).toBeInTheDocument();
  });
});
