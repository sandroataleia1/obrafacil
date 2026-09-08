"use client";

import { useEffect, useState } from "react";

import { getDashboardSupplySummary, type DashboardSupplySummary } from "./dashboard-supply-summary";

/** `undefined` until read on mount — same post-mount-read pattern as
 * `useSupplyPositions`/`useDashboardSummary`, avoids a hydration
 * mismatch against the localStorage-backed stores it reads from. */
export function useDashboardSupplySummary() {
  const [summary, setSummary] = useState<DashboardSupplySummary | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSummary(getDashboardSupplySummary());
  }, []);

  return summary;
}
