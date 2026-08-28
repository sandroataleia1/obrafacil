"use client";

import { useEffect, useState } from "react";

import { getPayable } from "./payable-store";
import type { Payable } from "../types";

export function usePayable(id: string) {
  const [payable, setPayable] = useState<Payable | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayable(getPayable(id));
  }, [id]);

  function refresh() {
    setPayable(getPayable(id));
  }

  return { payable, refresh };
}
