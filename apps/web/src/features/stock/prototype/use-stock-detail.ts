"use client";

import { useEffect, useState } from "react";

import { getStockTotals, listStockMovements, type StockTotals } from "./stock";
import type { StockMovement } from "../types";

export function useStockDetail(projectId: string, materialId: string) {
  const [movements, setMovements] = useState<StockMovement[] | undefined>(undefined);
  const [totals, setTotals] = useState<StockTotals | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMovements(listStockMovements(projectId, materialId));
    setTotals(getStockTotals(projectId, materialId));
  }, [projectId, materialId]);

  function refresh() {
    setMovements(listStockMovements(projectId, materialId));
    setTotals(getStockTotals(projectId, materialId));
  }

  return { movements, totals, refresh };
}
