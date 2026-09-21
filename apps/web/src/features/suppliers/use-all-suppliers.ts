"use client";

/**
 * SUPPLY-FRONTEND-01A §17. Async replacement for the deleted
 * `prototype/use-suppliers.ts` — same contract/tenant-safety discipline
 * as `features/materials/use-all-materials.ts` (state tagged with
 * `companyId`, `activeCompanyIdRef` via `useLayoutEffect`, request
 * sequence, explicit `error: true`).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { listAllSuppliersFromApi } from "./suppliers-client";
import type { SupplierListItem } from "./types";

interface LoadedSuppliers {
  companyId: string | undefined;
  suppliers: SupplierListItem[];
}

export function useAllSuppliers(params: { active?: boolean } = {}): {
  suppliers: SupplierListItem[] | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeOnly = params.active;

  const [loaded, setLoaded] = useState<LoadedSuppliers | null>(null);
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
    listAllSuppliersFromApi({ active: activeOnly })
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setLoaded({ companyId: requestCompanyId, suppliers: data });
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
  const suppliers = isCurrentTenant ? loaded.suppliers : undefined;
  const error = errorCompanyId === activeCompanyId;

  return { suppliers, error, reload: load };
}
