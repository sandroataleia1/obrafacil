"use client";

import { useEffect, useState } from "react";

import { listStockPositions } from "./stock";
import type { StockPosition } from "../types";

export function useStockPositions() {
  const [positions, setPositions] = useState<StockPosition[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositions(listStockPositions());
  }, []);

  function refresh() {
    setPositions(listStockPositions());
  }

  return { positions, refresh };
}
