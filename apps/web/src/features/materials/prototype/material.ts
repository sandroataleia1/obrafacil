/**
 * Domain operations for Material that need to know about
 * MaterialRequirement/PurchaseOrderItem — kept out of
 * `material-store.ts` (pure persistence) the same way `receivable.ts`
 * sits above `receivable-store.ts`.
 *
 * A MaterialRequirement stores only `requiredQuantity`, and a
 * PurchaseOrderItem stores only a `unit` *snapshot* — neither can
 * absorb a later change to `Material.defaultUnit` without silently
 * changing meaning ("100" becoming "100 kg" instead of "100 sc" for a
 * Requirement that never touched its own number; a historical
 * purchase's snapshot staying "sc" while the catalog now says "kg",
 * breaking the planning aggregation in
 * `features/purchases/prototype/purchase-totals.ts`, which sums
 * PurchaseOrderItem quantities by `materialId` assuming they all still
 * share the Material's current unit). So once ANY MaterialRequirement
 * OR PurchaseOrderItem references a Material, that Material's
 * `defaultUnit` — including a custom unit's `customLabel` — becomes
 * immutable; `name`, `notes`, and `status` stay editable regardless.
 * The same reasoning blocks deletion: neither a MaterialRequirement
 * nor a PurchaseOrderItem may ever be left pointing at a `materialId`
 * that no longer exists.
 *
 * Importing from `features/purchases` here (rather than the reverse)
 * is intentional and non-circular: `features/purchases/prototype/
 * purchase-order.ts` only imports `getMaterial` from
 * `material-store.ts` (pure persistence), never from this file.
 */

import { todayIso } from "@/lib/date";
import { listItemsByMaterial } from "@/features/purchases/prototype/purchase-order-item-store";
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

export function materialHasPurchaseOrderItems(materialId: string): boolean {
  return listItemsByMaterial(materialId).length > 0;
}

/** True when the Material's `defaultUnit` must stay locked / cannot be deleted. */
export function materialHasDependencies(materialId: string): boolean {
  return materialHasRequirements(materialId) || materialHasPurchaseOrderItems(materialId);
}

export function updateMaterial(
  existing: Material,
  changes: { name: string; defaultUnit: MaterialUnit; notes?: string }
): MaterialResult {
  if (changes.name.trim() === "") {
    return { ok: false, error: "Informe o nome do material." };
  }

  const unitChanged = !isSameUnit(existing.defaultUnit, changes.defaultUnit);
  if (unitChanged && materialHasDependencies(existing.id)) {
    return {
      ok: false,
      error: "Este material já possui planejamento ou compras e sua unidade não pode ser alterada.",
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
  if (materialHasPurchaseOrderItems(material.id)) {
    return {
      ok: false,
      error:
        "Este material está sendo usado em pedidos de compra. Remova os itens antes de excluir o material.",
    };
  }
  deleteMaterialRecord(material.id);
  return { ok: true };
}
