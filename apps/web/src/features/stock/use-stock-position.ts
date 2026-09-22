"use client";

/**
 * SUPPLY-FRONTEND-01D §21/§52. Detail hook for a single Project+Material
 * StockPosition — same contract/tenant-safety discipline as
 * `usePurchaseOrder`: `undefined` = loading, `null` = 404 REAL (Project
 * or Material doesn't exist/belong to this tenant — `resolvePair()`
 * threw), `error: true` = network/500 distinct from not-found. A valid
 * pair with zero physical history is NOT a 404 — the backend returns
 * zero-valued metrics for it (`getPosition()` never throws for that
 * case), so it resolves here as a normal, successful `StockPosition`
 * object, never collapsed into `null`. State tagged with
 * `{companyId, projectId, materialId}`, refs written via
 * `useLayoutEffect` so a microtask-resolved promise continuation for the
 * old company/pair can never mistake itself for current.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { getStockPosition } from "./stock-client";
import type { StockPosition } from "./types";

interface LoadedPosition {
  companyId: string | undefined;
  projectId: string;
  materialId: string;
  position: StockPosition | null;
}

export function useStockPosition(
  projectId: string,
  materialId: string
): {
  position: StockPosition | null | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedPosition | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  const projectIdRef = useRef(projectId);
  const materialIdRef = useRef(materialId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    projectIdRef.current = projectId;
    materialIdRef.current = materialId;
  }, [activeCompanyId, projectId, materialId]);

  const load = useCallback(() => {
    if (projectId === "" || materialId === "") return;
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestProjectId = projectId;
    const requestMaterialId = materialId;
    setErrorKey(null);
    getStockPosition(projectId, materialId)
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (
          activeCompanyIdRef.current !== requestCompanyId ||
          projectIdRef.current !== requestProjectId ||
          materialIdRef.current !== requestMaterialId
        )
          return;
        setLoaded({ companyId: requestCompanyId, projectId: requestProjectId, materialId: requestMaterialId, position: data });
      })
      .catch((error: unknown) => {
        if (requestSequence.current !== requestId) return;
        if (
          activeCompanyIdRef.current !== requestCompanyId ||
          projectIdRef.current !== requestProjectId ||
          materialIdRef.current !== requestMaterialId
        )
          return;
        if (error instanceof ApiError && error.status === 404) {
          setLoaded({ companyId: requestCompanyId, projectId: requestProjectId, materialId: requestMaterialId, position: null });
          return;
        }
        setErrorKey(`${requestCompanyId ?? ""}:${requestProjectId}:${requestMaterialId}`);
      });
  }, [projectId, materialId, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant =
    loaded !== null && loaded.companyId === activeCompanyId && loaded.projectId === projectId && loaded.materialId === materialId;
  const position = isCurrentTenant ? loaded.position : undefined;
  const error = errorKey === `${activeCompanyId ?? ""}:${projectId}:${materialId}`;

  return { position, error, reload: load };
}
