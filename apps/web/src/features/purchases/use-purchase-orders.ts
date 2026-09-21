"use client";

/**
 * SUPPLY-FRONTEND-01C. Server-paginated list hook for `PurchaseOrderList` —
 * mirrors the tenant-safety/late-request discipline used inline by
 * `features/materials/material-list.tsx`, extracted into a hook because
 * this list carries more filter dimensions (search/status/project/
 * supplier/page). State is tagged with `{companyId, fingerprint}` where
 * `fingerprint` folds in every filter dimension — a change to ANY of them
 * (not just `page`) must independently fail closed against a still-
 * in-flight request for the previous filter set. `error: true` is never
 * collapsed into an empty list — a real empty result and a fetch failure
 * are distinct render states.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { listPurchaseOrders } from "./purchase-orders-client";
import type { PurchaseOrderListParams, PurchaseOrderPaginationResponse } from "./types";

function fingerprintOf(params: PurchaseOrderListParams): string {
  return JSON.stringify([
    params.search ?? "",
    params.commercialStatus ?? "",
    params.projectId ?? "",
    params.supplierId ?? "",
    params.page ?? 1,
  ]);
}

interface LoadedList {
  companyId: string | undefined;
  fingerprint: string;
  response: PurchaseOrderPaginationResponse;
}

export function usePurchaseOrderList(params: PurchaseOrderListParams): {
  response: PurchaseOrderPaginationResponse | undefined;
  error: boolean;
  loading: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const fingerprint = fingerprintOf(params);

  const [loaded, setLoaded] = useState<LoadedList | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  const fingerprintRef = useRef(fingerprint);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    fingerprintRef.current = fingerprint;
  }, [activeCompanyId, fingerprint]);

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestFingerprint = fingerprint;
    setErrorKey(null);
    setLoadingKey(`${requestCompanyId ?? ""}:${requestFingerprint}`);
    listPurchaseOrders(params)
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || fingerprintRef.current !== requestFingerprint) return;
        setLoaded({ companyId: requestCompanyId, fingerprint: requestFingerprint, response: data });
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || fingerprintRef.current !== requestFingerprint) return;
        setErrorKey(`${requestCompanyId ?? ""}:${requestFingerprint}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, fingerprint]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const currentKey = `${activeCompanyId ?? ""}:${fingerprint}`;
  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId && loaded.fingerprint === fingerprint;
  const response = isCurrentTenant ? loaded.response : undefined;
  const error = errorKey === currentKey;
  const loading = !error && loadingKey === currentKey && !isCurrentTenant;

  return { response, error, loading, reload: load };
}
