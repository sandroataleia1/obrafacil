/**
 * SUPPLY-FRONTEND-01A. `Material` (the master catalog) is now the real
 * API domain contract — mirrors `App\Http\Resources\MaterialResource` /
 * `MaterialListResource` and `Store`/`UpdateMaterialRequest` field-for-
 * field (same discipline as `features/projects/types.ts`). Never invent
 * a field here without a matching backend source.
 *
 * `MaterialRequirement`/`MaterialConsumption` below are UNCHANGED — they
 * remain a legacy frontend prototype child contract (localStorage,
 * SUPPLY-FRONTEND-01B/01C will migrate them). The master Material itself
 * is API-backed as of this gate; these children only ever store a
 * `materialId` string and resolve the real identity via the API
 * (`useMaterial`/`useAllMaterials`), never a second local Material model.
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

/** GET/POST/PUT /api/v1/materials/{material} — full detail. */
export interface Material {
  id: string;
  name: string;
  unit_code: MaterialUnitCode;
  unit_custom_label: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** A row from GET /api/v1/materials — lean shape, mirrors MaterialListResource. */
export interface MaterialListItem {
  id: string;
  name: string;
  unit_code: MaterialUnitCode;
  unit_custom_label: string | null;
  active: boolean;
  updated_at: string;
}

/** Laravel's default paginate() JSON shape. */
export interface MaterialPaginationResponse {
  data: MaterialListItem[];
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
  };
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
}

/**
 * POST /api/v1/materials. Never `id`/`company_id`/`created_at`/
 * `updated_at` — `active` defaults to `true` server-side when omitted.
 */
export interface MaterialCreatePayload {
  name: string;
  unit_code: MaterialUnitCode;
  unit_custom_label?: string | null;
  notes?: string | null;
  active?: boolean;
}

/** PUT /api/v1/materials/{material} — `UpdateMaterialRequest` requires every field. */
export interface MaterialUpdatePayload {
  name: string;
  unit_code: MaterialUnitCode;
  unit_custom_label?: string | null;
  notes?: string | null;
  active: boolean;
}

export interface MaterialListParams {
  search?: string;
  page?: number;
  perPage?: number;
  active?: boolean;
}

export const MATERIAL_STATUS_FILTERS = ["all", "active", "inactive"] as const;
export type MaterialStatusFilter = (typeof MATERIAL_STATUS_FILTERS)[number];

export const MATERIAL_STATUS_FILTER_LABEL: Record<MaterialStatusFilter, string> = {
  all: "Todos",
  active: "Ativos",
  inactive: "Inativos",
};

/**
 * Legacy frontend prototype child snapshot shape — `PurchaseOrderItem`
 * (still local prototype) snapshots a Material's unit at the moment an
 * item is added, in this shape (distinct from the API's
 * `unit_code`/`unit_custom_label` field names). Build one from a
 * resolved API `Material` with
 * `{ code: material.unit_code, customLabel: material.unit_custom_label ?? undefined }`.
 */
export interface MaterialUnit {
  code: MaterialUnitCode;
  customLabel?: string;
}

/**
 * Legacy frontend prototype child contract (localStorage) — the master
 * Material itself is API-backed (see `Material` above). Preserved
 * unchanged in shape from before this gate; only `material.ts`'s
 * synchronous `getMaterial()` lookups around it were removed.
 */
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
 * Legacy frontend prototype child contract (localStorage) — same note
 * as `MaterialRequirement` above.
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
