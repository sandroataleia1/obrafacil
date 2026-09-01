"use client";

import { useEffect, useState } from "react";

import { getPurchaseOrder } from "./purchase-order-store";
import { listItemsByPurchaseOrder } from "./purchase-order-item-store";
import type { PurchaseOrder, PurchaseOrderItem } from "../types";

export function usePurchaseOrder(id: string) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null | undefined>(undefined);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);

  useEffect(() => {
    const found = getPurchaseOrder(id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPurchaseOrder(found);
    setItems(found ? listItemsByPurchaseOrder(id) : []);
  }, [id]);

  function refresh() {
    const found = getPurchaseOrder(id);
    setPurchaseOrder(found);
    setItems(found ? listItemsByPurchaseOrder(id) : []);
  }

  return { purchaseOrder, items, refresh };
}
