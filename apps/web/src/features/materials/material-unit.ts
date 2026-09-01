import { MATERIAL_UNIT_CODE_LABEL, type MaterialUnit } from "./types";

/**
 * Resolves a Material's unit to its display label — the single place
 * that knows how to read `customLabel` for "other", so list/detail/
 * form never duplicate this branching.
 */
export function formatMaterialUnit(unit: MaterialUnit): string {
  if (unit.code === "other") {
    return unit.customLabel?.trim() || "un";
  }
  return MATERIAL_UNIT_CODE_LABEL[unit.code];
}
