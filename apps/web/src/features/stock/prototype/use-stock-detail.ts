"use client";

import { useEffect, useState } from "react";

import type { ReceivedEvent } from "@/features/purchases/purchase-received-events";
import { getStockTotals, listStockMovements, type StockTotals } from "./stock";
import type { StockMovement } from "../types";

/**
 * SUPPLY-FRONTEND-01C1: `receivedEvents` is the caller's own
 * already-resolved array (derived from a real `PurchaseOrder[]` fetch
 * via `purchaseOrdersToReceivedEvents`) — this hook does no fetching of
 * its own. The caller (`StockDetail`) is responsible for only calling
 * this once the Purchase API fetch has actually resolved — passing an
 * empty array while the fetch is still pending/failed would silently
 * render `received = 0`, which is never acceptable (see `StockDetail`'s
 * own fail-closed gating).
 */
export function useStockDetail(projectId: string, materialId: string, receivedEvents: ReceivedEvent[]) {
  const [movements, setMovements] = useState<StockMovement[] | undefined>(undefined);
  const [totals, setTotals] = useState<StockTotals | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMovements(listStockMovements(projectId, materialId, receivedEvents));
    setTotals(getStockTotals(projectId, materialId, receivedEvents));
  }, [projectId, materialId, receivedEvents]);

  function refresh() {
    setMovements(listStockMovements(projectId, materialId, receivedEvents));
    setTotals(getStockTotals(projectId, materialId, receivedEvents));
  }

  return { movements, totals, refresh };
}
