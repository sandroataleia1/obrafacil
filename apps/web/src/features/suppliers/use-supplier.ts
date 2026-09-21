"use client";

/**
 * SUPPLY-FRONTEND-01A §18. Async replacement for the deleted
 * `prototype/use-supplier.ts`. Same contract as
 * `features/materials/use-material.ts` — `undefined` = loading, `null`
 * = 404 real, `error: true` = network/500.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { getSupplier } from "./suppliers-client";
import type { Supplier } from "./types";

interface LoadedSupplier {
  companyId: string | undefined;
  id: string;
  supplier: Supplier | null;
}

export function useSupplier(id: string): {
  supplier: Supplier | null | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedSupplier | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  const idRef = useRef(id);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    idRef.current = id;
  }, [activeCompanyId, id]);

  const load = useCallback(() => {
    if (id === "") return;
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestSupplierId = id;
    setErrorKey(null);
    getSupplier(id)
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || idRef.current !== requestSupplierId) return;
        setLoaded({ companyId: requestCompanyId, id: requestSupplierId, supplier: data });
      })
      .catch((error: unknown) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || idRef.current !== requestSupplierId) return;
        if (error instanceof ApiError && error.status === 404) {
          setLoaded({ companyId: requestCompanyId, id: requestSupplierId, supplier: null });
          return;
        }
        setErrorKey(`${requestCompanyId ?? ""}:${requestSupplierId}`);
      });
  }, [id, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId && loaded.id === id;
  const supplier = isCurrentTenant ? loaded.supplier : undefined;
  const error = errorKey === `${activeCompanyId ?? ""}:${id}`;

  return { supplier, error, reload: load };
}
