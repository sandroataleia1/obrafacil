"use client";

import { useEffect, useState } from "react";

import { getPurchaseOrderItem } from "./purchase-order-item-store";
import type { PurchaseOrderItem } from "../types";

export function usePurchaseOrderItem(id: string) {
  const [item, setItem] = useState<PurchaseOrderItem | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItem(getPurchaseOrderItem(id));
  }, [id]);

  function refresh() {
    setItem(getPurchaseOrderItem(id));
  }

  return { item, refresh };
}
