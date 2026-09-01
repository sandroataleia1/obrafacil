"use client";

import { useEffect, useState } from "react";

import { getRequirement } from "./material-requirement-store";
import type { MaterialRequirement } from "../types";

export function useRequirement(id: string) {
  const [requirement, setRequirement] = useState<MaterialRequirement | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequirement(getRequirement(id));
  }, [id]);

  function refresh() {
    setRequirement(getRequirement(id));
  }

  return { requirement, refresh };
}
