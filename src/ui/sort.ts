import type { Application } from "../models/types";

export type SortKey = "company" | "position" | "appliedDate" | "status";
export type SortDir = "asc" | "desc";

export function sortApplications(
  apps: Application[],
  key: SortKey,
  dir: SortDir,
): Application[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...apps].sort((a, b) => {
    const av = String(a[key]).toLowerCase();
    const bv = String(b[key]).toLowerCase();
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return 0;
  });
}
