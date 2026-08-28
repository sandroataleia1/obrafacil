"use client";

import { useEffect, useState } from "react";

import { listAllPayables } from "./payable-store";
import type { Payable } from "../types";

export function usePayables() {
  const [payables, setPayables] = useState<Payable[] | undefined>(undefined);

  useEffect(() => {
    // Read from localStorage only after mount: both the server render and
    // the initial client hydration render show `undefined` (loading), so
    // this never causes a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayables(listAllPayables());
  }, []);

  function refresh() {
    setPayables(listAllPayables());
  }

  return { payables, refresh };
}
