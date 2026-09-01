"use client";

import { useEffect, useState } from "react";

import { listRequirementsByProject } from "./material-requirement-store";
import type { MaterialRequirement } from "../types";

export function useRequirements(projectId: string) {
  const [requirements, setRequirements] = useState<MaterialRequirement[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequirements(listRequirementsByProject(projectId));
  }, [projectId]);

  function refresh() {
    setRequirements(listRequirementsByProject(projectId));
  }

  return { requirements, refresh };
}
