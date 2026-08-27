import type { Project } from "@/features/projects/types";

export const projects: Project[] = [
  {
    id: "edicula-fundos-obra",
    name: "Edícula Fundos",
    customerId: "carlos-souza",
    customerName: "Carlos Souza",
    reference: "Construção nos fundos",
    address: "Rua das Palmeiras, 210 - São Paulo/SP",
    status: "in_progress",
    budgetId: "edicula-fundos",
    expectedStartDate: "2026-08-01",
    createdAt: "2026-08-16",
    updatedAt: "2026-08-25",
  },
  {
    id: "reforma-cozinha-martins",
    name: "Reforma Cozinha",
    customerId: "ana-martins",
    customerName: "Ana Martins",
    reference: "Reforma pontual",
    address: "Av. Brasil, 980 - São Paulo/SP",
    status: "planning",
    createdAt: "2026-08-20",
    updatedAt: "2026-08-20",
  },
];
