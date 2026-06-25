import { useState } from "react";
import { emptyProfile, type Profile } from "../../models/types";

interface Props {
  initial?: Profile;
  onComplete: (profile: Profile) => void;
}

const STEPS = ["Personal", "Education", "Experience", "Preferences"] as const;

export function ProfileWizard({ initial, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(initial ?? emptyProfile());

  const isLast = step === STEPS.length - 1;

  function next() {
    if (isLast) {
      onComplete(profile);
    } else {
      setStep(step + 1);
    }
  }

  function setPersonal(field: keyof Profile["personal"], value: string) {
    setProfile({ ...profile, personal: { ...profile.personal, [field]: value } });
  }

  return (
    <div>
      <h2>Setup — {STEPS[step]}</h2>

      {step === 0 && (
        <div>
          <label>Full name<input value={profile.personal.fullName} onChange={(e) => setPersonal("fullName", e.target.value)} /></label>
          <label>Email<input value={profile.personal.email} onChange={(e) => setPersonal("email", e.target.value)} /></label>
          <label>Phone<input value={profile.personal.phone} onChange={(e) => setPersonal("phone", e.target.value)} /></label>
          <label>LinkedIn<input value={profile.personal.linkedin} onChange={(e) => setPersonal("linkedin", e.target.value)} /></label>
        </div>
      )}

      {step === 1 && (
        <div>
          <label>
            School
            <input
              value={profile.education[0]?.school ?? ""}
              onChange={(e) => {
                // NOTE: rebuilds entry[0] from scratch — when adding more fields to this step, preserve them here or data will be lost.
                setProfile({
                  ...profile,
                  education: [{
                    school: e.target.value, degree: profile.education[0]?.degree ?? "",
                    field: "", startDate: "", endDate: "", gpa: "",
                  }],
                })
              }}
            />
          </label>
        </div>
      )}

      {step === 2 && (
        <div>
          <label>
            Most recent title
            <input
              value={profile.experience[0]?.title ?? ""}
              onChange={(e) => {
                // NOTE: rebuilds entry[0] from scratch — when adding more fields to this step, preserve them here or data will be lost.
                setProfile({
                  ...profile,
                  experience: [{
                    company: profile.experience[0]?.company ?? "", title: e.target.value,
                    startDate: "", endDate: "", description: "",
                  }],
                })
              }}
            />
          </label>
        </div>
      )}

      {step === 3 && (
        <div>
          <label>
            Desired salary
            <input
              value={profile.preferences.desiredSalary}
              onChange={(e) => setProfile({ ...profile, preferences: { ...profile.preferences, desiredSalary: e.target.value } })}
            />
          </label>
        </div>
      )}

      <div>
        {step > 0 && <button type="button" onClick={() => setStep(step - 1)}>Back</button>}
        <button type="button" onClick={next}>{isLast ? "Finish" : "Next"}</button>
      </div>
    </div>
  );
}
