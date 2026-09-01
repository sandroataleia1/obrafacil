import type { MaterialRequirement } from "@/features/materials/types";

export const materialRequirements: MaterialRequirement[] = [
  {
    id: "requirement-edicula-cimento",
    projectId: "edicula-fundos-obra",
    materialId: "material-cimento-cp2",
    requiredQuantity: 100,
    createdAt: "2026-08-20",
    updatedAt: "2026-08-20",
  },
  {
    id: "requirement-edicula-areia",
    projectId: "edicula-fundos-obra",
    materialId: "material-areia-media",
    requiredQuantity: 8.5,
    createdAt: "2026-08-20",
    updatedAt: "2026-08-20",
  },
  {
    id: "requirement-edicula-brita",
    projectId: "edicula-fundos-obra",
    materialId: "material-brita-1",
    requiredQuantity: 5,
    createdAt: "2026-08-20",
    updatedAt: "2026-08-20",
  },
  {
    id: "requirement-edicula-vergalhao",
    projectId: "edicula-fundos-obra",
    materialId: "material-vergalhao-10mm",
    requiredQuantity: 40,
    notes: "Confirmar bitola com o engenheiro antes de comprar.",
    createdAt: "2026-08-22",
    updatedAt: "2026-08-22",
  },
];
