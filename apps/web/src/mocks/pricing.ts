/**
 * Prototype pricing for UI validation only.
 * Real prices will come from organization/material data through Laravel.
 */

export const masonryMaterialUnitPrice: Record<string, number> = {
  "tijolo-9x14x29": 1.15,
  "bloco-14x19x39": 3.9,
  "tijolo-9x19x29": 1.25,
};

export const auxiliaryMaterialPrice = {
  cementPerBag: 38,
  limePerBag: 18,
  sandPerM3: 150,
};

export const DEFAULT_MARGIN_PERCENTAGE = 20;
