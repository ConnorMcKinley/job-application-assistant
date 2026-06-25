import { useState } from "react";
import {
  APPLICATION_STATUSES,
  LOCATION_TYPES,
  type Application,
  type ApplicationStatus,
  type LocationType,
} from "../../models/types";
import type { NewApplication } from "../../data/applicationRepo";

interface Props {
  initial?: Application;
  onSubmit: (values: NewApplication) => void;
  onCancel: () => void;
}

export function ApplicationForm({ initial, onSubmit, onCancel }: Props) {
  const [company, setCompany] = useState(initial?.company ?? "");
  const [position, setPosition] = useState(initial?.position ?? "");
  const [locType, setLocType] = useState<LocationType>(initial?.location.type ?? "remote");
  const [locPlace, setLocPlace] = useState(initial?.location.place ?? "");
  const [jobUrl, setJobUrl] = useState(initial?.jobUrl ?? "");
  const [appliedDate, setAppliedDate] = useState(initial?.appliedDate ?? "");
  const [status, setStatus] = useState<ApplicationStatus>(initial?.status ?? "applied");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      company,
      position,
      location: { type: locType, place: locPlace },
      jobUrl,
      atsType: initial?.atsType ?? "",
      appliedDate,
      status,
      linkedEmails: initial?.linkedEmails ?? [],
      recruiterContacts: initial?.recruiterContacts ?? [],
      notes,
    });
  }

  return (
    <form onSubmit={submit}>
      <label>Company<input value={company} onChange={(e) => setCompany(e.target.value)} /></label>
      <label>Position<input value={position} onChange={(e) => setPosition(e.target.value)} /></label>
      <label>
        Location type
        <select value={locType} onChange={(e) => setLocType(e.target.value as LocationType)}>
          {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label>Location place<input value={locPlace} onChange={(e) => setLocPlace(e.target.value)} /></label>
      <label>Job URL<input value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} /></label>
      <label>Applied date<input type="date" value={appliedDate} onChange={(e) => setAppliedDate(e.target.value)} /></label>
      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
          {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <button type="submit">Save</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </form>
  );
}
