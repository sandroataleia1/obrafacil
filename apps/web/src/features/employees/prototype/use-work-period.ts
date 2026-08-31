"use client";

import { useEffect, useState } from "react";

import { findWorkPeriod, saveWorkPeriod } from "./work-period-store";
import type { EmployeeWorkPeriod } from "../types";

export function useWorkPeriod(employeeId: string, period: string) {
  const [workPeriod, setWorkPeriod] = useState<EmployeeWorkPeriod | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkPeriod(findWorkPeriod(employeeId, period));
  }, [employeeId, period]);

  function persist(next: EmployeeWorkPeriod) {
    const updated = { ...next, updatedAt: new Date().toISOString().slice(0, 10) };
    setWorkPeriod(updated);
    saveWorkPeriod(updated);
  }

  return { workPeriod, persist };
}
