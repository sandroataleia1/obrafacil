"use client";

import { useEffect, useState } from "react";

import { getProjectCost } from "./project-cost-store";
import type { ProjectCost } from "../types";

export function useProjectCost(id: string | null) {
  const [cost, setCost] = useState<ProjectCost | null | undefined>(
    id ? undefined : null
  );

  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCost(getProjectCost(id));
  }, [id]);

  return cost;
}
