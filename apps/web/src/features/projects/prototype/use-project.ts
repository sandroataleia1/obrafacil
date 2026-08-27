"use client";

import { useEffect, useState } from "react";

import { getProject, saveProject } from "./project-store";
import type { Project } from "../types";

export function useProject(id: string) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);

  useEffect(() => {
    // Read from localStorage only after mount: both the server render and
    // the initial client hydration render show `undefined` (loading), so
    // this never causes a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProject(getProject(id));
  }, [id]);

  function persist(next: Project) {
    const updated = { ...next, updatedAt: new Date().toISOString().slice(0, 10) };
    setProject(updated);
    saveProject(updated);
  }

  return { project, persist };
}
