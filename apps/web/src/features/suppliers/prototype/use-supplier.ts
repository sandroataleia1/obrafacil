"use client";

import { useEffect, useState } from "react";

import { getSupplier } from "./supplier-store";
import type { Supplier } from "../types";

export function useSupplier(id: string) {
  const [supplier, setSupplier] = useState<Supplier | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupplier(getSupplier(id));
  }, [id]);

  function refresh() {
    setSupplier(getSupplier(id));
  }

  return { supplier, refresh };
}
