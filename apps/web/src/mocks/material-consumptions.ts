import type { MaterialConsumption } from "@/features/materials/types";

/**
 * Prototype seed data — see Task 042 spec for the mandatory cases this
 * covers: (1) partially consumed with multi-entry history, (2) fully
 * consumed, (3) inactive Material still usable from existing stock,
 * (4) consumption over the physically-received portion of a later
 * cancelled PurchaseOrder.
 */
export const materialConsumptions: MaterialConsumption[] = [
  // Case 1: Cimento CP-II at Edícula Fundos — received 80 sc total
  // (goods-receipt-1: 40 + goods-receipt-2: 25 + goods-receipt-3: 15),
  // consumed 50 across two entries, leaving 30 available.
  {
    id: "consumption-cimento-edicula-1",
    projectId: "edicula-fundos-obra",
    materialId: "material-cimento-cp2",
    quantity: 30,
    consumedAt: "2026-08-25",
    notes: "Alvenaria lateral",
    createdAt: "2026-08-25",
    updatedAt: "2026-08-25",
  },
  {
    id: "consumption-cimento-edicula-2",
    projectId: "edicula-fundos-obra",
    materialId: "material-cimento-cp2",
    quantity: 20,
    consumedAt: "2026-08-29",
    notes: "Contrapiso",
    createdAt: "2026-08-29",
    updatedAt: "2026-08-29",
  },
  // Case 2: Areia média at Edícula Fundos — received 5 m³
  // (goods-receipt-1), fully consumed.
  {
    id: "consumption-areia-edicula-total",
    projectId: "edicula-fundos-obra",
    materialId: "material-areia-media",
    quantity: 5,
    consumedAt: "2026-08-26",
    notes: "Contrapiso e chapisco",
    createdAt: "2026-08-26",
    updatedAt: "2026-08-26",
  },
  // Case 3: Tinta acrílica (status: inactive in the catalog) at Edícula
  // Fundos — received 10 L (goods-receipt-5) while still active; still
  // usable now that it's inactive, since inactivation only removes it
  // from new purchases, not from physical stock already on hand.
  {
    id: "consumption-tinta-edicula-1",
    projectId: "edicula-fundos-obra",
    materialId: "material-tinta-acrilica",
    quantity: 4,
    consumedAt: "2026-08-30",
    notes: "Pintura interna",
    createdAt: "2026-08-30",
    updatedAt: "2026-08-30",
  },
  // Case 4: Vergalhão 10 mm at Reforma Cozinha — received 8 barras
  // (goods-receipt-4) before the rest of the order was cancelled;
  // consumption over the physically-received portion only.
  {
    id: "consumption-vergalhao-cozinha-1",
    projectId: "reforma-cozinha-martins",
    materialId: "material-vergalhao-10mm",
    quantity: 5,
    consumedAt: "2026-08-13",
    notes: "Armação da fundação",
    createdAt: "2026-08-13",
    updatedAt: "2026-08-13",
  },
];
