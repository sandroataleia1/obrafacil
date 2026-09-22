"use client";

import { useEffect, useState } from "react";

import type { ReceivedEvent } from "@/features/purchases/purchase-received-events";
import { listStockPositions } from "./stock";
import type { StockPosition } from "../types";

/**
 * SUPPLY-FRONTEND-01C1: `receivedEvents` is the caller's own
 * already-resolved array (never self-fetched/mirrored here). Currently
 * unused in the app (superseded by `useSupplyPositions`, which also
 * folds in MaterialRequirement coverage) — kept functional/consistent
 * rather than deleted, since it is real, working, generically-useful
 * "physical movement only" Estoque V1 positions.
 */
export function useStockPositions(receivedEvents: ReceivedEvent[]) {
  const [positions, setPositions] = useState<StockPosition[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositions(listStockPositions(receivedEvents));
  }, [receivedEvents]);

  function refresh() {
    setPositions(listStockPositions(receivedEvents));
  }

  return { positions, refresh };
}
