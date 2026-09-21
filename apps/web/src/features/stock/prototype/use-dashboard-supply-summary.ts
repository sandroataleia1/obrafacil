"use client";

/**
 * SUPPLY-FRONTEND-01B1. Derives the dashboard summary from
 * `useSupplyPositions()` (now async/tenant-safe, real Requirement API)
 * instead of its own synchronous read — never a second, independent
 * fetch of the same data.
 */

import { useMemo } from "react";

import { getDashboardSupplySummary, type DashboardSupplySummary } from "./dashboard-supply-summary";
import { useSupplyPositions } from "./use-supply-positions";

export function useDashboardSupplySummary(): {
  summary: DashboardSupplySummary | undefined;
  error: boolean;
  reload: () => void;
} {
  const { positions, error, reload } = useSupplyPositions();

  const summary = useMemo(
    () => (positions === undefined ? undefined : getDashboardSupplySummary(positions)),
    [positions]
  );

  return { summary, error, reload };
}
