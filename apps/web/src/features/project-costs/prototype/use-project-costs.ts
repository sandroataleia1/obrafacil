"use client";

import { useEffect, useState } from "react";

import { listCostsByProject } from "./project-cost-store";
import type { ProjectCost } from "../types";

export function useProjectCosts(projectId: string) {
  const [costs, setCosts] = useState<ProjectCost[] | undefined>(undefined);

  useEffect(() => {
    // Read from localStorage only after mount: both the server render and
    // the initial client hydration render show `undefined` (loading), so
    // this never causes a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCosts(listCostsByProject(projectId));
  }, [projectId]);

  function refresh() {
    setCosts(listCostsByProject(projectId));
  }

  return { costs, refresh };
}
