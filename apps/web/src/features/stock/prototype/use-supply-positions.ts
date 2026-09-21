"use client";

/**
 * SUPPLY-FRONTEND-01B1 §16-18. `listSupplyPositions()` now needs the
 * real, API-backed MaterialRequirement per Project — this hook became
 * an async, tenant-safe bridge instead of a synchronous localStorage
 * read. Reuses `useAllProjects()` (already tenant-safe, already the
 * canonical Project list) instead of re-fetching Projects a second time.
 * `error: true` on a Requirements failure NEVER degrades into
 * `positions` computed as if `required === null` — the whole hook fails
 * closed instead (§18).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { useAllProjects } from "@/features/projects/use-all-projects";
import { listMaterialRequirementsForProjects } from "@/features/materials/material-requirements-client";
import { listSupplyPositions, type StockSupplyPosition } from "./supply-metrics";

interface LoadedPositions {
  companyId: string | undefined;
  fingerprint: string;
  positions: StockSupplyPosition[];
}

export function useSupplyPositions(): {
  positions: StockSupplyPosition[] | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const { projects, error: projectsError, reload: reloadProjects } = useAllProjects();

  const [loaded, setLoaded] = useState<LoadedPositions | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const projectIds = (projects ?? []).map((project) => project.id);
  const fingerprint = projectIds.slice().sort().join(",");

  const load = useCallback(() => {
    if (projects === undefined) return;
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestFingerprint = fingerprint;
    setErrorKey(null);
    listMaterialRequirementsForProjects(projectIds)
      .then((requirementsByProject) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        const allRequirements = Array.from(requirementsByProject.values()).flat();
        setLoaded({
          companyId: requestCompanyId,
          fingerprint: requestFingerprint,
          positions: listSupplyPositions(allRequirements),
        });
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setErrorKey(`${requestCompanyId ?? ""}:${requestFingerprint}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, activeCompanyId, fingerprint]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId && loaded.fingerprint === fingerprint;
  const positions = isCurrentTenant ? loaded.positions : undefined;
  const error = projectsError || errorKey === `${activeCompanyId ?? ""}:${fingerprint}`;

  return {
    positions,
    error,
    reload: () => {
      reloadProjects();
      load();
    },
  };
}
