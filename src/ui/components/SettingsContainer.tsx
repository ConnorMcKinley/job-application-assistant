import { useEffect, useRef, useState } from "react";
import { SettingsView, type AuthStatus } from "./SettingsView";
import { defaultSettings, type Settings } from "../../models/types";
import { getSettings, saveSettings } from "../../data/settingsRepo";
import { createVerifier, challengeFromVerifier } from "../../llm/oauth/pkce";
import { buildAuthorizeUrl, parseCallbackCode, exchangeCode } from "../../llm/oauth/oauthFlow";
import { createLLMClient } from "../../llm/factory";

export function SettingsContainer({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [status, setStatus] = useState<AuthStatus>("not_connected");
  const [statusMessage, setStatusMessage] = useState("");
  const pkce = useRef<{ verifier: string; state: string } | null>(null);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  async function persist(next: Settings) {
    await saveSettings(next);
    setSettings(next);
  }

  async function selectBackend(llmBackend: "apiKey" | "oauth") {
    await persist({ ...settings, llmBackend });
  }

  async function saveApiKey(apiKey: string) {
    await persist({ ...settings, llmBackend: "apiKey", apiKey });
    setStatusMessage("API key saved.");
  }

  async function testApiKey() {
    setStatusMessage("Testing…");
    try {
      const client = createLLMClient(settings);
      await client.complete([{ role: "user", content: "Reply with OK." }], { maxTokens: 5 });
      setStatus("connected");
      setStatusMessage("API key works.");
    } catch (err) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Test failed.");
    }
  }

  async function connect() {
    const verifier = createVerifier();
    const state = createVerifier();
    pkce.current = { verifier, state };
    const challenge = await challengeFromVerifier(verifier);
    await chrome.tabs.create({ url: buildAuthorizeUrl({ challenge, state }) });
    setStatusMessage("Authorize in the new tab, then paste the code here.");
  }

  async function submitCode(rawPasted: string) {
    const saved = pkce.current;
    const { code, state } = parseCallbackCode(rawPasted);
    if (!saved || state === "" || state !== saved.state) {
      setStatus("error");
      setStatusMessage("State mismatch — please Connect again.");
      return;
    }
    try {
      const tokens = await exchangeCode({ code, state, verifier: saved.verifier });
      await persist({
        ...settings,
        llmBackend: "oauth",
        oauthAccessToken: tokens.accessToken,
        oauthRefreshToken: tokens.refreshToken,
        oauthExpiresAt: tokens.expiresAt,
      });
      setStatus("connected");
      setStatusMessage("Connected to your Claude subscription.");
    } catch (err) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Couldn't connect — try again.");
    }
  }

  async function disconnect() {
    await persist({ ...settings, oauthAccessToken: "", oauthRefreshToken: "", oauthExpiresAt: 0 });
    setStatus("not_connected");
    setStatusMessage("Disconnected.");
  }

  return (
    <SettingsView
      settings={settings}
      status={status}
      statusMessage={statusMessage}
      onSelectBackend={(b) => void selectBackend(b)}
      onSaveApiKey={(k) => void saveApiKey(k)}
      onTestApiKey={() => void testApiKey()}
      onConnect={() => void connect()}
      onSubmitCode={(p) => void submitCode(p)}
      onDisconnect={() => void disconnect()}
      onClose={onClose}
    />
  );
}
