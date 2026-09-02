"use client";

import { useEffect, useState } from "react";

import { getBudget, getBudgetByToken } from "./budget-store";
import type { Budget } from "../types";

export function useBudget(id: string) {
  const [budget, setBudget] = useState<Budget | null | undefined>(undefined);

  useEffect(() => {
    // Read from localStorage only after mount: both the server render and
    // the initial client hydration render show `undefined` (loading), so
    // this never causes a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBudget(getBudget(id));
  }, [id]);

  function refresh() {
    setBudget(getBudget(id));
  }

  return { budget, refresh };
}

export function useBudgetByToken(token: string) {
  const [budget, setBudget] = useState<Budget | null | undefined>(undefined);

  useEffect(() => {
    // Same reasoning as useBudget above: safe post-mount read, no mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBudget(getBudgetByToken(token));
  }, [token]);

  function refresh() {
    setBudget(getBudgetByToken(token));
  }

  return { budget, refresh };
}
