"use client";

import { useEffect, useState } from "react";

import { listAllWorkPeriods, listWorkPeriodsByEmployee } from "./work-period-store";
import type { EmployeeWorkPeriod } from "../types";

export function useWorkPeriods(employeeId: string) {
  const [workPeriods, setWorkPeriods] = useState<EmployeeWorkPeriod[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkPeriods(listWorkPeriodsByEmployee(employeeId));
  }, [employeeId]);

  function refresh() {
    setWorkPeriods(listWorkPeriodsByEmployee(employeeId));
  }

  return { workPeriods, refresh };
}

/** All work periods across every employee — feeds the Frequência overview (`/equipe/frequencia`). */
export function useAllWorkPeriods() {
  const [workPeriods, setWorkPeriods] = useState<EmployeeWorkPeriod[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkPeriods(listAllWorkPeriods());
  }, []);

  function refresh() {
    setWorkPeriods(listAllWorkPeriods());
  }

  return { workPeriods, refresh };
}
