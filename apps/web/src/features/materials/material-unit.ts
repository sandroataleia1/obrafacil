import { MATERIAL_UNIT_CODE_LABEL, type MaterialUnitCode } from "./types";

/**
 * SUPPLY-FRONTEND-01A §26. Resolves a Material's unit — sourced directly
 * from the API's `unit_code`/`unit_custom_label` fields — to its display
 * label. The single place that knows how to read `unit_custom_label` for
 * "other", so list/detail/form never duplicate this branching.
 */
export function formatMaterialUnitCode(code: MaterialUnitCode, customLabel: string | null): string {
  if (code === "other") {
    return customLabel?.trim() || "un";
  }
  return MATERIAL_UNIT_CODE_LABEL[code];
}
