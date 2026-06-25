import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { getSettings, saveSettings, markSetupComplete, isLlmConfigured } from "./settingsRepo";
import { defaultSettings } from "../models/types";

describe("settingsRepo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("defaults setupComplete to false", async () => {
    const s = await getSettings();
    expect(s.setupComplete).toBe(false);
    expect(s.llmBackend).toBe("apiKey");
  });

  it("persists settings", async () => {
    const s = defaultSettings();
    s.apiKey = "sk-test";
    await saveSettings(s);
    expect((await getSettings()).apiKey).toBe("sk-test");
  });

  it("marks setup complete", async () => {
    await markSetupComplete();
    expect((await getSettings()).setupComplete).toBe(true);
  });
});

describe("isLlmConfigured", () => {
  it("is false on defaults", () => {
    expect(isLlmConfigured(defaultSettings())).toBe(false);
  });
  it("is true with an api key", () => {
    expect(isLlmConfigured({ ...defaultSettings(), llmBackend: "apiKey", apiKey: "sk-x" })).toBe(true);
  });
  it("is true with oauth tokens", () => {
    expect(isLlmConfigured({ ...defaultSettings(), llmBackend: "oauth", oauthAccessToken: "sk-ant-oat01-x" })).toBe(true);
  });
  it("ignores an api key when backend is oauth", () => {
    expect(isLlmConfigured({ ...defaultSettings(), llmBackend: "oauth", apiKey: "sk-x" })).toBe(false);
  });
});
