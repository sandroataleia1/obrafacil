"use client";

import { useEffect, useState } from "react";

import { listAllReceivables } from "./receivable-store";
import type { Receivable } from "../types";

export function useReceivables() {
  const [receivables, setReceivables] = useState<Receivable[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReceivables(listAllReceivables());
  }, []);

  function refresh() {
    setReceivables(listAllReceivables());
  }

  return { receivables, refresh };
}
