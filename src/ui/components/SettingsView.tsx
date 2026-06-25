import { useState } from "react";
import type { Settings } from "../../models/types";

export type AuthStatus = "not_connected" | "connected" | "error";

interface Props {
  settings: Settings;
  status: AuthStatus;
  statusMessage: string;
  onSelectBackend: (b: "apiKey" | "oauth") => void;
  onSaveApiKey: (key: string) => void;
  onTestApiKey: () => void;
  onConnect: () => void;
  onSubmitCode: (pasted: string) => void;
  onDisconnect: () => void;
  onClose: () => void;
}

export function SettingsView(props: Props) {
  const { settings } = props;
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [pasted, setPasted] = useState("");

  return (
    <div>
      <h1>Settings</h1>
      <button type="button" onClick={props.onClose}>Back</button>

      <fieldset>
        <legend>LLM provider</legend>
        <label>
          <input type="radio" name="backend" checked={settings.llmBackend === "apiKey"}
            onChange={() => props.onSelectBackend("apiKey")} />
          Anthropic
        </label>
        <label>
          <input type="radio" name="backend" checked={settings.llmBackend === "oauth"}
            onChange={() => props.onSelectBackend("oauth")} />
          Claude subscription (experimental)
        </label>
      </fieldset>

      {settings.llmBackend === "apiKey" && (
        <div>
          <label htmlFor="api-key-input">API key</label>
          <input id="api-key-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <button type="button" onClick={() => props.onSaveApiKey(apiKey)}>Save</button>
          <button type="button" onClick={props.onTestApiKey}>Test</button>
        </div>
      )}

      {settings.llmBackend === "oauth" && (
        <div>
          <button type="button" onClick={props.onConnect}>Connect Claude subscription</button>
          <label htmlFor="paste-code-input">Paste the code from the callback page</label>
          <input id="paste-code-input" type="text" value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <button type="button" onClick={() => props.onSubmitCode(pasted)}>Submit</button>
          {settings.oauthAccessToken !== "" && (
            <button type="button" onClick={props.onDisconnect}>Disconnect</button>
          )}
        </div>
      )}

      {props.statusMessage ? <p role="status">{props.statusMessage}</p> : null}
    </div>
  );
}
