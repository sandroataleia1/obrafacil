/**
 * SUPPLY-FRONTEND-01A. `Material` (the master catalog) is now the real
 * API domain contract — mirrors `App\Http\Resources\MaterialResource` /
 * `MaterialListResource` and `Store`/`UpdateMaterialRequest` field-for-
 * field (same discipline as `features/projects/types.ts`). Never invent
 * a field here without a matching backend source.
 *
 * `MaterialRequirement` is ALSO the real API domain contract as of
 * SUPPLY-FRONTEND-01B/01B1 (see its own doc comment below).
 * `MaterialConsumption` moved to `features/stock/types.ts` as of
 * SUPPLY-FRONTEND-01D — it is now the real API contract too, and
 * conceptually belongs to the Stock domain alongside
 * `StockAdjustment`/`StockMovement`/`StockPosition`.
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
 * SUPPLY-FRONTEND-01B. MaterialRequirement is now the real API domain
 * contract — mirrors `App\Http\Resources\MaterialRequirementResource`
 * field-for-field. `material` is the LIVE relation (never a snapshot), so
 * a Material rename/reactivation shows up immediately; it may be
 * `active: false` for a Requirement created before the Material was
 * deactivated — the Requirement stays fully listable/editable/deletable
 * regardless. `required_quantity` is a decimal STRING at scale 3 (e.g.
 * `"1.000"`, `"2.500"`) — never converted to `number` here. SUPPLY-
 * FRONTEND-01D: every planning/quantity metric that used to feed off
 * this value's `number` bridge now comes straight from `StockPosition`
 * (`features/stock/types.ts`, real API,
 * `required_quantity`/`missing_to_purchase_quantity`) — this field is
 * never converted to `number` anywhere in the app anymore.
 *
 * SUPPLY-FRONTEND-01B1: the OLD camelCase/`localStorage` shape
 * (`projectId`/`materialId`/`requiredQuantity: number`, formerly in a
 * separate "legacy types" module) is GONE — every consumer (ProjectDetail,
 * the Dashboard Executive Panel, Analytics, Stock) now uses this one real
 * API shape. This is the only MaterialRequirement model in the frontend.
 */
export interface MaterialRequirement {
  id: string;
  project_id: string;
  material: {
    id: string;
    name: string;
    unit_code: MaterialUnitCode;
    unit_custom_label: string | null;
    active: boolean;
  };
  required_quantity: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Laravel's default paginate() JSON shape. */
export interface MaterialRequirementPaginationResponse {
  data: MaterialRequirement[];
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
 * POST /api/v1/projects/{project}/material-requirements. Never `id`/
 * `company_id`/`project_id`/`material`/`unit_code`/`unit_custom_label`/
 * `created_at`/`updated_at` — `project_id` always comes from the route.
 */
export interface MaterialRequirementCreatePayload {
  material_id: string;
  required_quantity: string;
  notes?: string | null;
}

/**
 * PUT /api/v1/projects/{project}/material-requirements/{requirement} —
 * `material_id`/`project_id` are immutable once created (delete + recreate
 * is the supported path for "wrong Material").
 */
export interface MaterialRequirementUpdatePayload {
  required_quantity: string;
  notes?: string | null;
}

export interface MaterialRequirementListParams {
  page?: number;
  perPage?: number;
}
