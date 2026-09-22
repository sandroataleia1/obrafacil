"use client";

/**
 * SUPPLY-FRONTEND-01D §22/§53. Server-paginated movement history for one
 * Project+Material pair. State tagged by `{companyId, projectId,
 * materialId, page}` — a late response for a stale page/pair/tenant is
 * discarded. Trusts the backend's own ordering
 * (`occurred_at DESC, source_created_at DESC, movement_id DESC`) — never
 * re-sorts client-side (§23).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { listStockMovements } from "./stock-client";
import type { StockMovementListParams, StockMovementPaginationResponse } from "./types";

interface LoadedMovements {
  companyId: string | undefined;
  projectId: string;
  materialId: string;
  page: number;
  response: StockMovementPaginationResponse;
}

export function useStockMovements(
  projectId: string,
  materialId: string,
  params: StockMovementListParams
): {
  response: StockMovementPaginationResponse | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const page = params.page ?? 1;

  const [loaded, setLoaded] = useState<LoadedMovements | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  const projectIdRef = useRef(projectId);
  const materialIdRef = useRef(materialId);
  const pageRef = useRef(page);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    projectIdRef.current = projectId;
    materialIdRef.current = materialId;
    pageRef.current = page;
  }, [activeCompanyId, projectId, materialId, page]);

  const load = useCallback(() => {
    if (projectId === "" || materialId === "") return;
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestProjectId = projectId;
    const requestMaterialId = materialId;
    const requestPage = page;
    setErrorKey(null);
    listStockMovements(projectId, materialId, params)
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (
          activeCompanyIdRef.current !== requestCompanyId ||
          projectIdRef.current !== requestProjectId ||
          materialIdRef.current !== requestMaterialId ||
          pageRef.current !== requestPage
        )
          return;
        setLoaded({
          companyId: requestCompanyId,
          projectId: requestProjectId,
          materialId: requestMaterialId,
          page: requestPage,
          response: data,
        });
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (
          activeCompanyIdRef.current !== requestCompanyId ||
          projectIdRef.current !== requestProjectId ||
          materialIdRef.current !== requestMaterialId ||
          pageRef.current !== requestPage
        )
          return;
        setErrorKey(`${requestCompanyId ?? ""}:${requestProjectId}:${requestMaterialId}:${requestPage}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, materialId, page, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant =
    loaded !== null &&
    loaded.companyId === activeCompanyId &&
    loaded.projectId === projectId &&
    loaded.materialId === materialId &&
    loaded.page === page;
  const response = isCurrentTenant ? loaded.response : undefined;
  const error = errorKey === `${activeCompanyId ?? ""}:${projectId}:${materialId}:${page}`;

  return { response, error, reload: load };
}
