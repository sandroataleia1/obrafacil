"use client";

import { useEffect, useState } from "react";

import { listSuppliers } from "./supplier-store";
import type { Supplier } from "../types";

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSuppliers(listSuppliers());
  }, []);

  function refresh() {
    setSuppliers(listSuppliers());
  }

  return { suppliers, refresh };
}
