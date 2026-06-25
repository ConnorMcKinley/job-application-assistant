import { useState } from "react";
import type { Application } from "../../models/types";
import { sortApplications, type SortDir, type SortKey } from "../sort";

interface Props {
  apps: Application[];
  onEdit: (app: Application) => void;
  onDelete: (id: number) => void;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "position", label: "Position" },
  { key: "status", label: "Status" },
  { key: "appliedDate", label: "Applied" },
];

function locationLabel(app: Application): string {
  return app.location.place ? `${app.location.type} · ${app.location.place}` : app.location.type;
}

export function ApplicationList({ apps, onEdit, onDelete }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("company");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = sortApplications(apps, sortKey, sortDir);

  return (
    <table>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c.key}>
              <button type="button" onClick={() => toggle(c.key)}>
                {c.label}
                {sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </button>
            </th>
          ))}
          <th>Location</th>
          <th>Link</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((a) => (
          <tr key={a.id}>
            <td>{a.company}</td>
            <td>{a.position}</td>
            <td>{a.status}</td>
            <td>{a.appliedDate}</td>
            <td>{locationLabel(a)}</td>
            <td>
              {a.jobUrl ? (
                <a href={a.jobUrl} target="_blank" rel="noreferrer">
                  open
                </a>
              ) : null}
            </td>
            <td>
              <button type="button" onClick={() => onEdit(a)}>
                Edit
              </button>
              <button type="button" onClick={() => onDelete(a.id!)}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
