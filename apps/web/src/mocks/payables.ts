import type { Payable } from "@/features/payables/types";

export const payables: Payable[] = [
  {
    id: "payable-casa-materiais-cimento",
    description: "Compra de cimento",
    supplier: "Casa dos Materiais Silva",
    amount: 2850,
    dueDate: "2026-09-05",
    category: "materials",
    projectId: "edicula-fundos-obra",
    createdAt: "2026-08-24",
    updatedAt: "2026-08-24",
  },
  {
    id: "payable-locadora-betoneira",
    description: "Aluguel de betoneira",
    supplier: "Locadora São José",
    amount: 780,
    dueDate: "2026-08-20",
    category: "equipment",
    projectId: "edicula-fundos-obra",
    createdAt: "2026-08-12",
    updatedAt: "2026-08-12",
  },
  {
    id: "payable-contabilidade-almeida",
    description: "Honorários contábeis",
    supplier: "Contabilidade Almeida",
    amount: 650,
    dueDate: "2026-08-10",
    category: "services",
    paidAt: "2026-08-09",
    createdAt: "2026-08-01",
    updatedAt: "2026-08-09",
  },
];
