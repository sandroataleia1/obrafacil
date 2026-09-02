/**
 * UI/prototype models for the Materiais catalog and planned Obra
 * requirements.
 *
 * `Material` is a global catalog, shared across every Obra — the same
 * "Cimento CP-II" is the same physical material regardless of which
 * Obra buys it. Deliberately excludes price, stock, supplier, brand,
 * barcode, NCM, and average cost: none of those belong to a basic
 * catalog entry, and none have a real use case yet in this prototype.
 *
 * `defaultUnit` is the material's single operational unit. Task 040's
 * PurchaseOrderItem will snapshot this unit at the moment an item is
 * ordered — the same Material can never be represented in two
 * different units across the system, because there is no unit
 * conversion in this prototype (50 kg is never treated as "1 saco").
 *
 * `MaterialRequirement` is the planned need of one Material for one
 * Obra ("Obra A needs 100 sc of Cimento CP-II"). It stores nothing
 * derivable from Project/Material (no `projectName`/`materialName`/
 * `unit`) and nothing that depends on Purchase/Delivery/Consumption
 * entities that don't exist yet (`ordered`/`received`/`consumed`/
 * `remainingToBuy` are all future, derived-only figures).
 *
 * NOT the definitive domain contract for the future API — only exists
 * to validate the product experience with mocked/local data.
 */

export type MaterialStatus = "active" | "inactive";

/**
 * Controlled set of common construction units, plus "other" for the
 * rare case not covered (e.g. "rolo", "milheiro", "barra"). "other"
 * always carries `customLabel` — the free text is preserved, never
 * collapsed into a generic "outro" string. No unit conversion exists
 * between any of these.
 */
export const MATERIAL_UNIT_CODES = [
  "un",
  "kg",
  "t",
  "m",
  "m2",
  "m3",
  "l",
  "sc",
  "cx",
  "other",
] as const;
export type MaterialUnitCode = (typeof MATERIAL_UNIT_CODES)[number];

export const MATERIAL_UNIT_CODE_LABEL: Record<Exclude<MaterialUnitCode, "other">, string> = {
  un: "un",
  kg: "kg",
  t: "t",
  m: "m",
  m2: "m²",
  m3: "m³",
  l: "L",
  sc: "saco",
  cx: "caixa",
};

export interface MaterialUnit {
  code: MaterialUnitCode;
  /** Only meaningful (and required in practice) when `code === "other"`. */
  customLabel?: string;
}

export interface Material {
  id: string;
  name: string;

  defaultUnit: MaterialUnit;

  notes?: string;
  status: MaterialStatus;

  createdAt: string;
  updatedAt: string;
}

export const MATERIAL_STATUS_LABEL: Record<MaterialStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export const MATERIAL_STATUS_FILTERS = ["all", "active", "inactive"] as const;
export type MaterialStatusFilter = (typeof MATERIAL_STATUS_FILTERS)[number];

export const MATERIAL_STATUS_FILTER_LABEL: Record<MaterialStatusFilter, string> = {
  all: "Todos",
  active: "Ativos",
  inactive: "Inativos",
};

export interface MaterialRequirement {
  id: string;

  projectId: string;
  materialId: string;

  requiredQuantity: number;

  notes?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * A physical event: this much of a Material was used at a Project.
 * Nothing financial — no cost, no ProjectCost, no Payable. Belongs to
 * Project + Material only, not to a specific PurchaseOrder/GoodsReceipt
 * (received quantity is aggregated across every delivery of that
 * Material at that Project — no lot/FIFO tracking in this v1).
 *
 * Deliberately excludes projectName/materialName/unit (all resolved
 * transitively, same pattern as PurchaseOrder/GoodsReceipt) and
 * receivedQuantity/availableQuantity (always derived, never stored —
 * see `prototype/material-consumption.ts`).
 *
 * No edit in this v1 — to correct an entry, delete and register again
 * (same pattern as GoodsReceipt).
 */
export interface MaterialConsumption {
  id: string;

  projectId: string;
  materialId: string;

  quantity: number;
  consumedAt: string;

  notes?: string;

  createdAt: string;
  updatedAt: string;
}
