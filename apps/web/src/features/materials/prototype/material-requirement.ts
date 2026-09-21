/**
 * Domain operations for MaterialRequirement. The (projectId,
 * materialId) uniqueness invariant lives here, not only in the form's
 * own logic — mirrors `receivable.ts`'s Cliente↔Obra guard.
 *
 * SUPPLY-FRONTEND-01A §50: Material is now the real API master — this
 * module no longer imports `material-store.ts` (deleted) or calls any
 * synchronous local lookup. `createRequirement()` instead takes the
 * ALREADY-RESOLVED Material (from `useMaterial`/`useAllMaterials`) as an
 * explicit parameter and validates `material.id === input.materialId`
 * (never trusts a caller passing a mismatched pair) plus
 * `material.active` for a NEW requirement — never makes an API call
 * itself from this synchronous domain function.
 */

import { todayIso } from "@/lib/date";
import type { Material } from "../types";
import {
  createRequirementId,
  deleteRequirement as deleteRequirementRecord,
  findRequirement,
  saveRequirement,
} from "./material-requirement-store";
import type { MaterialRequirement } from "../types";

export type RequirementResult =
  | { ok: true; requirement: MaterialRequirement }
  | { ok: false; error: string };

export function createRequirement(
  input: {
    projectId: string;
    materialId: string;
    requiredQuantity: number;
    notes?: string;
  },
  material: Material | null
): RequirementResult {
  // §46: Project existence is no longer synchronously checkable here —
  // it now lives exclusively in the real API. Callers only ever reach
  // this with a `projectId` already resolved from an API-backed
  // selector/route, so this check is dropped rather than faked.
  if (!material || material.id !== input.materialId) {
    return { ok: false, error: "Material não encontrado." };
  }
  if (!material.active) {
    return { ok: false, error: "Selecione um material ativo." };
  }
  if (!(input.requiredQuantity > 0)) {
    return { ok: false, error: "Informe uma quantidade maior que zero." };
  }
  if (findRequirement(input.projectId, input.materialId)) {
    return {
      ok: false,
      error: "Este material já possui uma necessidade cadastrada nesta obra. Edite o registro existente.",
    };
  }

  const now = todayIso();
  const requirement: MaterialRequirement = {
    id: createRequirementId(),
    projectId: input.projectId,
    materialId: input.materialId,
    requiredQuantity: input.requiredQuantity,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  saveRequirement(requirement);
  return { ok: true, requirement };
}

/**
 * Edits quantity/notes only — project and material stay fixed, same
 * simplification already used for `updatePeriodAllocation`. Changing
 * which Material a requirement is for risks a silent merge with an
 * existing requirement for that (project, material) pair; deleting
 * and recreating is the supported path instead.
 */
export function updateRequirement(
  existing: MaterialRequirement,
  changes: { requiredQuantity: number; notes?: string }
): RequirementResult {
  if (!(changes.requiredQuantity > 0)) {
    return { ok: false, error: "Informe uma quantidade maior que zero." };
  }

  const updated: MaterialRequirement = {
    ...existing,
    requiredQuantity: changes.requiredQuantity,
    notes: changes.notes?.trim() || undefined,
    updatedAt: todayIso(),
  };
  saveRequirement(updated);
  return { ok: true, requirement: updated };
}

export function removeRequirement(requirement: MaterialRequirement): void {
  deleteRequirementRecord(requirement.id);
}
