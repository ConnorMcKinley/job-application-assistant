import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsView } from "./SettingsView";
import { defaultSettings, type Settings } from "../../models/types";

function setup(over: Partial<Settings> = {}, props: Record<string, unknown> = {}) {
  const handlers = {
    onSelectBackend: vi.fn(), onSaveApiKey: vi.fn(), onTestApiKey: vi.fn(),
    onConnect: vi.fn(), onSubmitCode: vi.fn(), onDisconnect: vi.fn(), onClose: vi.fn(),
  };
  render(
    <SettingsView
      settings={{ ...defaultSettings(), ...over }}
      status="not_connected"
      statusMessage=""
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("SettingsView", () => {
  it("saves an entered API key", async () => {
    const h = setup({ llmBackend: "apiKey" });
    await userEvent.type(screen.getByLabelText(/api key/i), "sk-test");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(h.onSaveApiKey).toHaveBeenCalledWith("sk-test");
  });

  it("submits a pasted OAuth code", async () => {
    const h = setup({ llmBackend: "oauth" });
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(h.onConnect).toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/paste/i), "abc#xyz");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(h.onSubmitCode).toHaveBeenCalledWith("abc#xyz");
  });

  it("shows Disconnect only when oauth tokens exist", () => {
    setup({ llmBackend: "oauth", oauthAccessToken: "sk-ant-oat01-x" });
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });
});
