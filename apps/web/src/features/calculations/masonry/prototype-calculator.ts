/**
 * Prototype calculation for UI validation only.
 * Laravel Calculation Engine will be the source of truth.
 *
 * The main quantity (blocks/bricks per m²) follows a straightforward,
 * defensible formula. The auxiliary materials below (mortar, cement, lime,
 * sand) use arbitrary placeholder ratios chosen only to populate the result
 * screen during UX validation — they are NOT the official masonry formulas
 * and must be replaced when the real Calculation Engine is extracted from
 * the Calculadora Ágil spreadsheet.
 */

import type { MasonryMaterial } from "@/mocks/calculations/masonry";
import type { OpeningItem } from "./types";

export interface MasonryCalculationInput {
  material: MasonryMaterial;
  lengthM: number;
  heightM: number;
  doors: OpeningItem[];
  windows: OpeningItem[];
  wastePercentage: number;
}

export interface MasonryAuxiliaryMaterials {
  mortarM3: number;
  cementBags: number;
  limeBags: number;
  sandM3: number;
}

export interface MasonryCalculationResult {
  grossAreaM2: number;
  openingsAreaM2: number;
  netAreaM2: number;
  wastePercentage: number;
  unitsBeforeWaste: number;
  units: number;
  auxiliary: MasonryAuxiliaryMaterials;
}

function sumOpeningsArea(items: OpeningItem[]): number {
  return items.reduce(
    (total, item) => total + item.widthM * item.heightM * item.quantity,
    0
  );
}

export function calculateMasonry(
  input: MasonryCalculationInput
): MasonryCalculationResult {
  const grossAreaM2 = input.lengthM * input.heightM;
  const openingsAreaM2 =
    sumOpeningsArea(input.doors) + sumOpeningsArea(input.windows);
  const netAreaM2 = Math.max(grossAreaM2 - openingsAreaM2, 0);

  const unitsBeforeWaste = netAreaM2 * input.material.unitsPerSquareMeter;
  const units = Math.ceil(
    unitsBeforeWaste * (1 + input.wastePercentage / 100)
  );

  // Placeholder ratios only — not the official mortar/cement/lime/sand formulas.
  const mortarM3 = netAreaM2 * 0.015;
  const cementBags = Math.ceil(mortarM3 * 7);
  const limeBags = Math.ceil(mortarM3 * 14);
  const sandM3 = Math.round(mortarM3 * 1.15 * 100) / 100;

  return {
    grossAreaM2,
    openingsAreaM2,
    netAreaM2,
    wastePercentage: input.wastePercentage,
    unitsBeforeWaste,
    units,
    auxiliary: {
      mortarM3: Math.round(mortarM3 * 100) / 100,
      cementBags,
      limeBags,
      sandM3,
    },
  };
}
