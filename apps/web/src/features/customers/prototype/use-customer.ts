"use client";

import { useEffect, useState } from "react";

import { getCustomer, saveCustomer } from "./customer-store";
import type { Customer } from "../types";

export function useCustomer(id: string) {
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);

  useEffect(() => {
    // Read from localStorage only after mount: both the server render and
    // the initial client hydration render show `undefined` (loading), so
    // this never causes a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomer(getCustomer(id));
  }, [id]);

  function persist(next: Customer) {
    const updated = { ...next, updatedAt: new Date().toISOString().slice(0, 10) };
    setCustomer(updated);
    saveCustomer(updated);
  }

  return { customer, persist };
}
