"use client";

/**
 * SUPPLY-FRONTEND-01A §13-15. Async replacement for the deleted
 * `prototype/use-materials.ts` — every dependent module that needs the
 * full set of Materials for a selector/dropdown or a per-row "resolve
 * this materialId's name" lookup (never the main `/materiais` list,
 * which paginates server-side) goes through here. Backed by
 * `listAllMaterialsFromApi()` (pages internally, never silently
 * truncates past 100). Same tenant-safety discipline as
 * `useAllProjects` — see that hook's docblock for the full rationale
 * (state tagged with `companyId`, `activeCompanyIdRef` written via
 * `useLayoutEffect`, request sequence, explicit `error: true` never
 * collapsed into `[]`).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { listAllMaterialsFromApi } from "./materials-client";
import type { MaterialListItem } from "./types";

interface LoadedMaterials {
  companyId: string | undefined;
  materials: MaterialListItem[];
}

export function useAllMaterials(params: { active?: boolean } = {}): {
  materials: MaterialListItem[] | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeOnly = params.active;

  const [loaded, setLoaded] = useState<LoadedMaterials | null>(null);
  const [errorCompanyId, setErrorCompanyId] = useState<string | undefined>(undefined);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setErrorCompanyId(undefined);
    listAllMaterialsFromApi({ active: activeOnly })
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setLoaded({ companyId: requestCompanyId, materials: data });
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setErrorCompanyId(requestCompanyId);
      });
  }, [activeCompanyId, activeOnly]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId;
  const materials = isCurrentTenant ? loaded.materials : undefined;
  const error = errorCompanyId === activeCompanyId;

  return { materials, error, reload: load };
}
