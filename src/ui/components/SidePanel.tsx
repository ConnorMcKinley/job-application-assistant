import type { SWToPanel } from "../../autofill/sidepanelMessages";

interface Props {
  state: SWToPanel;
  onStart: () => void;
  onApprove: () => void;
  onAbort: () => void;
}

const ACTIVE = new Set(["extracting", "planning", "filling", "checkpoint", "advancing", "submitReady"]);

export function SidePanel({ state, onStart, onApprove, onAbort }: Props) {
  const { phase, fills, checkpoints, screen, error } = state;
  const idle = phase === "idle" || phase === "done" || phase === "aborted";

  return (
    <div>
      <h1>Auto-fill</h1>
      <p>Phase: {phase} · Screen {screen + 1}</p>
      {error ? <p role="alert">Error: {error}</p> : null}
      <p>{fills.length} field(s) filled</p>

      {phase === "checkpoint" && (
        <div>
          <h2>Needs you</h2>
          <ul>
            {checkpoints.map((c) => (
              <li key={c.id}>
                <strong>{c.id}</strong>: {c.reason}
              </li>
            ))}
          </ul>
          <button type="button" onClick={onApprove}>Approve &amp; continue</button>
        </div>
      )}

      {phase === "submitReady" && (
        <p>Submit is yours — review and finish in the page.</p>
      )}

      {idle && <button type="button" onClick={onStart}>Start auto-fill</button>}
      {ACTIVE.has(phase) && <button type="button" onClick={onAbort}>Stop</button>}
    </div>
  );
}
