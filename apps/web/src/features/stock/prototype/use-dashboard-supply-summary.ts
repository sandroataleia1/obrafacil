"use client";

/**
 * SUPPLY-FRONTEND-01D §37/§71. Derives the dashboard summary from
 * `listAllStockPositions()` (real API, fetched once for the whole
 * Company) instead of the removed `useSupplyPositions()` prototype.
 * Same tagged-state/live-ref/error-contract discipline as every other
 * Company-scoped hook in this gate.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { listAllStockPositions } from "../stock-client";
import type { StockPosition } from "../types";
import { getDashboardSupplySummary, type DashboardSupplySummary } from "./dashboard-supply-summary";

interface LoadedPositions {
  companyId: string | undefined;
  positions: StockPosition[];
}

export function useDashboardSupplySummary(): {
  summary: DashboardSupplySummary | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedPositions | null>(null);
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
    listAllStockPositions()
      .then((positions) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setLoaded({ companyId: requestCompanyId, positions });
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setErrorCompanyId(requestCompanyId);
      });
  }, [activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId;
  const positions = isCurrentTenant ? loaded.positions : undefined;
  const error = errorCompanyId === activeCompanyId;

  const summary = useMemo(() => (positions === undefined ? undefined : getDashboardSupplySummary(positions)), [positions]);

  return { summary, error, reload: load };
}
