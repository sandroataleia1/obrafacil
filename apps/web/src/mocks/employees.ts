import type { Employee } from "@/features/employees/types";

export const employees: Employee[] = [
  {
    id: "joao-pereira",
    name: "João Pereira",
    role: "Pedreiro",
    phone: "11988880001",
    baseSalary: 3200,
    status: "active",
    createdAt: "2026-07-01",
    updatedAt: "2026-08-20",
  },
  {
    id: "carlos-santos",
    name: "Carlos Santos",
    role: "Servente",
    phone: "11988880002",
    baseSalary: 2300,
    status: "active",
    createdAt: "2026-07-01",
    updatedAt: "2026-08-18",
  },
  {
    id: "marcos-oliveira",
    name: "Marcos Oliveira",
    role: "Pintor",
    baseSalary: 2800,
    status: "active",
    createdAt: "2026-07-10",
    updatedAt: "2026-07-10",
  },
  {
    id: "andre-lima",
    name: "André Lima",
    role: "Eletricista",
    phone: "11988880004",
    baseSalary: 3600,
    status: "inactive",
    createdAt: "2026-06-15",
    updatedAt: "2026-08-05",
  },
];
