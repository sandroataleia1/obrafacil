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
 * SUPPLY-FRONTEND-01B. MaterialRequirement is now the real API domain
 * contract — mirrors `App\Http\Resources\MaterialRequirementResource`
 * field-for-field. `material` is the LIVE relation (never a snapshot), so
 * a Material rename/reactivation shows up immediately; it may be
 * `active: false` for a Requirement created before the Material was
 * deactivated — the Requirement stays fully listable/editable/deletable
 * regardless. `required_quantity` is a decimal STRING at scale 3 (e.g.
 * `"1.000"`, `"2.500"`) — never converted to `number` here; `number` is
 * only ever produced transiently at the boundary with the still-local
 * Purchase/Stock planning calculator (see
 * `requirement-quantity.ts#requirementQuantityForLegacyPlanning`).
 *
 * The OLD camelCase/`localStorage` shape (`projectId`/`materialId`/
 * `requiredQuantity: number`) moved to
 * `prototype/legacy-types.ts#LegacyMaterialRequirement` — it remains the
 * data source for a few out-of-scope local consumers (Dashboard,
 * Analytics, Stock supply-metrics); see that file's doc comment. Two
 * models exist ONLY because those consumers are explicitly out of this
 * gate's scope — every migrated screen uses this one.
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

/**
 * Legacy frontend prototype child contract (localStorage) — still local
 * as of this gate (SUPPLY-FRONTEND-01B only migrates MaterialRequirement;
 * MaterialConsumption/PurchaseOrder/StockAdjustment remain local).
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
