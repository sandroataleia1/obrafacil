/**
 * Domain operations for Material that need to know about
 * MaterialRequirement — kept out of `material-store.ts` (pure
 * persistence) the same way `receivable.ts` sits above
 * `receivable-store.ts`.
 *
 * A MaterialRequirement stores only `requiredQuantity`, never a unit
 * — it relies entirely on `Material.defaultUnit` to give that number
 * meaning ("100" only means "100 sc" because the Material says so).
 * If a Material's unit could change after a Requirement exists, every
 * existing Requirement would silently change meaning (100 sc becoming
 * 100 kg) without anyone touching the Requirement itself. So once any
 * MaterialRequirement references a Material, that Material's
 * `defaultUnit` — including a custom unit's `customLabel` — becomes
 * immutable; `name`, `notes`, and `status` stay editable regardless.
 * The same reasoning blocks deletion: a MaterialRequirement must never
 * be left pointing at a `materialId` that no longer exists.
 */

import { todayIso } from "@/lib/date";
import { listRequirements } from "./material-requirement-store";
import { deleteMaterial as deleteMaterialRecord, saveMaterial } from "./material-store";
import type { Material, MaterialUnit } from "../types";

export type MaterialResult = { ok: true; material: Material } | { ok: false; error: string };
export type DomainResult = { ok: true } | { ok: false; error: string };

function isSameUnit(a: MaterialUnit, b: MaterialUnit): boolean {
  if (a.code !== b.code) return false;
  if (a.code === "other") return (a.customLabel ?? "").trim() === (b.customLabel ?? "").trim();
  return true;
}

export function materialHasRequirements(materialId: string): boolean {
  return listRequirements().some((requirement) => requirement.materialId === materialId);
}

export function updateMaterial(
  existing: Material,
  changes: { name: string; defaultUnit: MaterialUnit; notes?: string }
): MaterialResult {
  if (changes.name.trim() === "") {
    return { ok: false, error: "Informe o nome do material." };
  }

  const unitChanged = !isSameUnit(existing.defaultUnit, changes.defaultUnit);
  if (unitChanged && materialHasRequirements(existing.id)) {
    return {
      ok: false,
      error: "Este material já é usado em obras e sua unidade não pode ser alterada.",
    };
  }

  const updated: Material = {
    ...existing,
    name: changes.name.trim(),
    defaultUnit: changes.defaultUnit,
    notes: changes.notes?.trim() || undefined,
    updatedAt: todayIso(),
  };
  saveMaterial(updated);
  return { ok: true, material: updated };
}

export function removeMaterial(material: Material): DomainResult {
  if (materialHasRequirements(material.id)) {
    return {
      ok: false,
      error:
        "Este material possui necessidades cadastradas em obras. Remova-as antes de excluir o material.",
    };
  }
  deleteMaterialRecord(material.id);
  return { ok: true };
}
