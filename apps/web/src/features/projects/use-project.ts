"use client";

/**
 * Async replacement for the deleted `prototype/use-project.ts`. Keeps the
 * SAME return contract on purpose (`project: Project | null | undefined`,
 * `undefined` = loading, `null` = not found or errored) so every existing
 * secondary consumer (Equipe pages, etc.) needed only an import-path
 * change, not a rewrite — see FRONTEND-PROJECTS-01 §47/§50. `ProjectDetail`
 * itself does NOT use this hook — it has its own richer loading/404/error/
 * retry states, mirroring `ServiceOrderDetail`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { getProject } from "./projects-client";
import type { Project } from "./types";

export function useProject(id: string): { project: Project | null | undefined; reload: () => void } {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [project, setProject] = useState<Project | null | undefined>(undefined);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setProject(undefined);
    getProject(id)
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setProject(data);
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setProject(null);
      });
  }, [id, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { project, reload: load };
}
