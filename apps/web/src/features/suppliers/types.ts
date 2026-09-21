/**
 * SUPPLY-FRONTEND-01A. Real API domain contract for Fornecedores —
 * mirrors `App\Http\Resources\SupplierResource` / `SupplierListResource`
 * and `Store`/`UpdateSupplierRequest` field-for-field (same discipline
 * as `features/projects/types.ts`). `phone` is E.164
 * (`+5511999999999`) — see `supplier-phone.ts` for the BR display
 * adapter. `document` is canonical digits-only (CPF or CNPJ) — see
 * `lib/document.ts#formatCpfCnpj` for display.
 */

export interface Supplier {
  id: string;
  name: string;
  document: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** A row from GET /api/v1/suppliers — lean shape, mirrors SupplierListResource. */
export interface SupplierListItem {
  id: string;
  name: string;
  document: string | null;
  contact_name: string | null;
  phone: string | null;
  active: boolean;
  updated_at: string;
}

/** Laravel's default paginate() JSON shape. */
export interface SupplierPaginationResponse {
  data: SupplierListItem[];
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
 * POST /api/v1/suppliers. Never `id`/`company_id`/`created_at`/
 * `updated_at` — `active` defaults to `true` server-side when omitted.
 * `document`/`phone` must already be canonical (digits-only / E.164)
 * before reaching this payload — see `lib/document.ts#onlyDigits` and
 * `supplier-phone.ts#supplierPhoneInputToApi`.
 */
export interface SupplierCreatePayload {
  name: string;
  document?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  active?: boolean;
}

/** PUT /api/v1/suppliers/{supplier} — `UpdateSupplierRequest` requires every field. */
export interface SupplierUpdatePayload {
  name: string;
  document?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  active: boolean;
}

export interface SupplierListParams {
  search?: string;
  page?: number;
  perPage?: number;
  active?: boolean;
}

export const SUPPLIER_STATUS_FILTERS = ["all", "active", "inactive"] as const;
export type SupplierStatusFilter = (typeof SUPPLIER_STATUS_FILTERS)[number];

export const SUPPLIER_STATUS_FILTER_LABEL: Record<SupplierStatusFilter, string> = {
  all: "Todos",
  active: "Ativos",
  inactive: "Inativos",
};
