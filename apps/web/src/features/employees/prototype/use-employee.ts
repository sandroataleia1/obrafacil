"use client";

import { useEffect, useState } from "react";

import { getEmployee, saveEmployee } from "./employee-store";
import type { Employee } from "../types";

export function useEmployee(id: string) {
  const [employee, setEmployee] = useState<Employee | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmployee(getEmployee(id));
  }, [id]);

  function persist(next: Employee) {
    const updated = { ...next, updatedAt: new Date().toISOString().slice(0, 10) };
    setEmployee(updated);
    saveEmployee(updated);
  }

  return { employee, persist };
}
