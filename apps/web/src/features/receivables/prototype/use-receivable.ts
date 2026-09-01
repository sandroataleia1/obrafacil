"use client";

import { useEffect, useState } from "react";

import { getReceivable } from "./receivable-store";
import { listReceiptsByReceivable } from "./receipt-store";
import type { Receipt, Receivable } from "../types";

export function useReceivable(id: string) {
  const [receivable, setReceivable] = useState<Receivable | null | undefined>(undefined);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  useEffect(() => {
    const found = getReceivable(id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReceivable(found);
    setReceipts(found ? listReceiptsByReceivable(id) : []);
  }, [id]);

  function refresh() {
    const found = getReceivable(id);
    setReceivable(found);
    setReceipts(found ? listReceiptsByReceivable(id) : []);
  }

  return { receivable, receipts, refresh };
}
