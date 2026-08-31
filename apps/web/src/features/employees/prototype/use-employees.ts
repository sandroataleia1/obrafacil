"use client";

import { useEffect, useState } from "react";

import { listAllEmployees } from "./employee-store";
import type { Employee } from "../types";

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[] | undefined>(undefined);

  useEffect(() => {
    // Read from localStorage only after mount: both the server render and
    // the initial client hydration render show `undefined` (loading), so
    // this never causes a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmployees(listAllEmployees());
  }, []);

  function refresh() {
    setEmployees(listAllEmployees());
  }

  return { employees, refresh };
}
