"use client";

import { useEffect, useState } from "react";

import { listSupplyPositions, type StockSupplyPosition } from "./supply-metrics";

export function useSupplyPositions() {
  const [positions, setPositions] = useState<StockSupplyPosition[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositions(listSupplyPositions());
  }, []);

  function refresh() {
    setPositions(listSupplyPositions());
  }

  return { positions, refresh };
}
