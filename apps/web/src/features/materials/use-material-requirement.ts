"use client";

/**
 * SUPPLY-FRONTEND-01B §13-14. Async replacement for the deleted
 * `prototype/use-requirement.ts`. Same contract/tenant-safety discipline
 * as `useMaterial`/`useProject`: `undefined` = loading, `null` = 404 real,
 * `error: true` = network/500 distinct from not-found — never collapsed
 * into `catch => null`. State tagged with `{companyId, projectId, id}`,
 * `activeCompanyIdRef`/`projectIdRef`/`idRef` written via `useLayoutEffect`
 * so a microtask-resolved promise continuation for the old
 * company/project/id can never mistake itself for current.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { getMaterialRequirement } from "./material-requirements-client";
import type { MaterialRequirement } from "./types";

interface LoadedRequirement {
  companyId: string | undefined;
  projectId: string;
  id: string;
  requirement: MaterialRequirement | null;
}

export function useMaterialRequirement(
  projectId: string,
  requirementId: string
): {
  requirement: MaterialRequirement | null | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedRequirement | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  const projectIdRef = useRef(projectId);
  const idRef = useRef(requirementId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    projectIdRef.current = projectId;
    idRef.current = requirementId;
  }, [activeCompanyId, projectId, requirementId]);

  const load = useCallback(() => {
    if (requirementId === "") return;
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestProjectId = projectId;
    const requestRequirementId = requirementId;
    setErrorKey(null);
    getMaterialRequirement(projectId, requirementId)
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (
          activeCompanyIdRef.current !== requestCompanyId ||
          projectIdRef.current !== requestProjectId ||
          idRef.current !== requestRequirementId
        )
          return;
        setLoaded({ companyId: requestCompanyId, projectId: requestProjectId, id: requestRequirementId, requirement: data });
      })
      .catch((error: unknown) => {
        if (requestSequence.current !== requestId) return;
        if (
          activeCompanyIdRef.current !== requestCompanyId ||
          projectIdRef.current !== requestProjectId ||
          idRef.current !== requestRequirementId
        )
          return;
        if (error instanceof ApiError && error.status === 404) {
          setLoaded({ companyId: requestCompanyId, projectId: requestProjectId, id: requestRequirementId, requirement: null });
          return;
        }
        setErrorKey(`${requestCompanyId ?? ""}:${requestProjectId}:${requestRequirementId}`);
      });
  }, [projectId, requirementId, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant =
    loaded !== null && loaded.companyId === activeCompanyId && loaded.projectId === projectId && loaded.id === requirementId;
  const requirement = isCurrentTenant ? loaded.requirement : undefined;
  const error = errorKey === `${activeCompanyId ?? ""}:${projectId}:${requirementId}`;

  return { requirement, error, reload: load };
}
