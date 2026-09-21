"use client";

/**
 * SUPPLY-FRONTEND-01B §10-12. Async replacement for the deleted
 * `prototype/use-requirements.ts` — every Requirement screen for a Project
 * (create-form selector exclusion, edit-form, `ProjectRequirementList`)
 * goes through here. Backed by `listAllMaterialRequirements()` (pages
 * internally, never assumes <=100 Requirements per Obra). Same tenant-
 * safety discipline as `useAllMaterials`/`useAllProjects`, extended with a
 * SECOND tag dimension (`projectId`) — a Company switch AND a Project
 * switch must each independently fail closed: state is tagged with
 * `{companyId, projectId}`, both `activeCompanyIdRef`/`projectIdRef`
 * written via the SAME `useLayoutEffect`, explicit `error: true` never
 * collapsed into `[]` (a real empty Obra vs. a fetch failure are
 * distinct).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { listAllMaterialRequirements } from "./material-requirements-client";
import type { MaterialRequirement } from "./types";

interface LoadedRequirements {
  companyId: string | undefined;
  projectId: string;
  requirements: MaterialRequirement[];
}

export function useMaterialRequirements(projectId: string): {
  requirements: MaterialRequirement[] | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedRequirements | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  const projectIdRef = useRef(projectId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    projectIdRef.current = projectId;
  }, [activeCompanyId, projectId]);

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestProjectId = projectId;
    setErrorKey(null);
    listAllMaterialRequirements(projectId)
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || projectIdRef.current !== requestProjectId) return;
        setLoaded({ companyId: requestCompanyId, projectId: requestProjectId, requirements: data });
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || projectIdRef.current !== requestProjectId) return;
        setErrorKey(`${requestCompanyId ?? ""}:${requestProjectId}`);
      });
  }, [activeCompanyId, projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId && loaded.projectId === projectId;
  const requirements = isCurrentTenant ? loaded.requirements : undefined;
  const error = errorKey === `${activeCompanyId ?? ""}:${projectId}`;

  return { requirements, error, reload: load };
}
