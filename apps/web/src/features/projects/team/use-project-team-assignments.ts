"use client";

import { useEffect, useState } from "react";

import { listAssignmentsByProject } from "./project-team-assignment-store";
import type { ProjectTeamAssignment } from "./types";

export function useProjectTeamAssignments(projectId: string) {
  const [assignments, setAssignments] = useState<ProjectTeamAssignment[] | undefined>(undefined);

  useEffect(() => {
    // Read from localStorage only after mount: both the server render and
    // the initial client hydration render show `undefined` (loading), so
    // this never causes a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignments(listAssignmentsByProject(projectId));
  }, [projectId]);

  function refresh() {
    setAssignments(listAssignmentsByProject(projectId));
  }

  return { assignments, refresh };
}
