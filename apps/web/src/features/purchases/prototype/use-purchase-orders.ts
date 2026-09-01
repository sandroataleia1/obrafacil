"use client";

import { useEffect, useState } from "react";

import { listPurchaseOrders } from "./purchase-order-store";
import type { PurchaseOrder } from "../types";

export function usePurchaseOrders() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPurchaseOrders(listPurchaseOrders());
  }, []);

  function refresh() {
    setPurchaseOrders(listPurchaseOrders());
  }

  return { purchaseOrders, refresh };
}
