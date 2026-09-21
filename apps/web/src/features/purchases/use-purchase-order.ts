"use client";

/**
 * SUPPLY-FRONTEND-01C. Detail hook for a single PurchaseOrder — same
 * contract/tenant-safety discipline as `useMaterialRequirement`:
 * `undefined` = loading, `null` = 404 real, `error: true` = network/500
 * distinct from not-found — never collapsed into `catch => null`. State
 * tagged with `{companyId, id}`, `activeCompanyIdRef`/`idRef` written via
 * `useLayoutEffect` so a microtask-resolved promise continuation for the
 * old company/id can never mistake itself for current.
 *
 * Item-level edit/detail must resolve `order.items.find(...)` from this
 * already-loaded order — there is no standalone GET-item endpoint.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { getPurchaseOrder } from "./purchase-orders-client";
import type { PurchaseOrder } from "./types";

interface LoadedOrder {
  companyId: string | undefined;
  id: string;
  order: PurchaseOrder | null;
}

export function usePurchaseOrder(id: string): {
  order: PurchaseOrder | null | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedOrder | null>(null);
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
    const requestId_ = id;
    setErrorKey(null);
    getPurchaseOrder(id)
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || idRef.current !== requestId_) return;
        setLoaded({ companyId: requestCompanyId, id: requestId_, order: data });
      })
      .catch((error: unknown) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || idRef.current !== requestId_) return;
        if (error instanceof ApiError && error.status === 404) {
          setLoaded({ companyId: requestCompanyId, id: requestId_, order: null });
          return;
        }
        setErrorKey(`${requestCompanyId ?? ""}:${requestId_}`);
      });
  }, [id, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId && loaded.id === id;
  const order = isCurrentTenant ? loaded.order : undefined;
  const error = errorKey === `${activeCompanyId ?? ""}:${id}`;

  return { order, error, reload: load };
}
