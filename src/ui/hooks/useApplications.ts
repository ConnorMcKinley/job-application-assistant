import { useCallback, useEffect, useState } from "react";
import type { Application } from "../../models/types";
import { listApplications } from "../../data/applicationRepo";

export function useApplications(): { apps: Application[]; reload: () => void } {
  const [apps, setApps] = useState<Application[]>([]);

  const reload = useCallback(() => {
    void listApplications().then(setApps);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { apps, reload };
}
