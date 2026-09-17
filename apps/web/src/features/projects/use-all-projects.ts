"use client";

/**
 * FRONTEND-PROJECTS-01 §6/§47. Async replacement for the deleted
 * `prototype/project-store.ts`'s `listAllProjects()` — every dependent
 * module that needs the full set of Obras for a selector/dropdown or a
 * per-row "resolve this projectId's name" lookup (never the main
 * `/obras` list, which paginates server-side) goes through here. Backed
 * by `listAllProjectsFromApi()` (pages internally, never silently
 * truncates past 100).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { listAllProjectsFromApi } from "./projects-client";
import type { ProjectListItem } from "./types";

export function useAllProjects(): { projects: ProjectListItem[] | undefined; reload: () => void } {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [projects, setProjects] = useState<ProjectListItem[] | undefined>(undefined);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setProjects(undefined);
    listAllProjectsFromApi()
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setProjects(data);
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setProjects([]);
      });
  }, [activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { projects, reload: load };
}
