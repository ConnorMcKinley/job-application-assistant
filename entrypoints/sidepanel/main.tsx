import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SidePanel } from "../../src/ui/components/SidePanel";
import type { PanelToSW, SWToPanel } from "../../src/autofill/sidepanelMessages";

const initial: SWToPanel = {
  type: "PANEL_STATE", phase: "idle", fills: [], checkpoints: [], screen: 0, error: null,
};

function send(msg: PanelToSW): void {
  void chrome.runtime.sendMessage(msg);
}

function App() {
  const [state, setState] = useState<SWToPanel>(initial);
  useEffect(() => {
    const listener = (msg: SWToPanel) => {
      if (msg?.type === "PANEL_STATE") setState(msg);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
  return (
    <SidePanel
      state={state}
      onStart={() => send({ type: "PANEL_START" })}
      onApprove={() => send({ type: "PANEL_APPROVE_ADVANCE" })}
      onAbort={() => send({ type: "PANEL_ABORT" })}
    />
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<React.StrictMode><App /></React.StrictMode>);
}
