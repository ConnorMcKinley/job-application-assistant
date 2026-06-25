import { useEffect, useState } from "react";
import { useApplications } from "../hooks/useApplications";
import { ApplicationList } from "./ApplicationList";
import { ApplicationForm } from "./ApplicationForm";
import { ProfileWizard } from "./ProfileWizard";
import { SettingsContainer } from "./SettingsContainer";
import {
  createApplication,
  updateApplication,
  deleteApplication,
  type NewApplication,
} from "../../data/applicationRepo";
import { getSettings, markSetupComplete, isLlmConfigured } from "../../data/settingsRepo";
import { saveProfile } from "../../data/profileRepo";
import type { Application, Profile } from "../../models/types";

type View = "loading" | "wizard" | "list" | "settings";

export function Dashboard() {
  const [view, setView] = useState<View>("loading");
  const [editing, setEditing] = useState<Application | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [configured, setConfigured] = useState(true);
  const { apps, reload } = useApplications();

  async function refreshGate() {
    setConfigured(isLlmConfigured(await getSettings()));
  }

  useEffect(() => {
    void getSettings().then((s) => {
      setConfigured(isLlmConfigured(s));
      setView(s.setupComplete ? "list" : "wizard");
    });
  }, []);

  async function finishWizard(profile: Profile) {
    await saveProfile(profile);
    await markSetupComplete();
    setView("list");
  }

  async function submitForm(values: NewApplication) {
    if (editing?.id != null) {
      await updateApplication(editing.id, values);
    } else {
      await createApplication(values);
    }
    setShowForm(false);
    setEditing(null);
    reload();
  }

  async function remove(id: number) {
    await deleteApplication(id);
    reload();
  }

  if (view === "loading") return <p>Loading…</p>;
  if (view === "wizard") return <ProfileWizard onComplete={(p) => void finishWizard(p)} />;
  if (view === "settings") {
    return <SettingsContainer onClose={() => { setView("list"); void refreshGate(); }} />;
  }

  return (
    <div>
      <header>
        <h1>Applications</h1>
        <button type="button" onClick={() => setView("settings")}>Settings</button>
      </header>
      {!configured && <p role="alert">Connect an LLM to enable auto-fill — open Settings.</p>}
      {showForm ? (
        <ApplicationForm
          initial={editing ?? undefined}
          onSubmit={(v) => void submitForm(v)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      ) : (
        <>
          <button type="button" onClick={() => { setEditing(null); setShowForm(true); }}>
            Add application
          </button>
          <ApplicationList
            apps={apps}
            onEdit={(a) => { setEditing(a); setShowForm(true); }}
            onDelete={(id) => void remove(id)}
          />
        </>
      )}
    </div>
  );
}
