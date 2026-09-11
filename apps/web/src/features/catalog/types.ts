/**
 * Real API domain contract for the commercial catalog (Produtos e
 * Serviços) — mirrors `App\Http\Resources\CatalogItemResource` and the
 * Store/Update Form Requests in `apps/api` field-for-field (BACKEND-05).
 * Never invent a field here without a matching backend source.
 */

export type CatalogItemType = "product" | "service";

/** GET/POST/PUT /api/v1/catalog-items/{id} — the same shape for list, show, create, and update responses. */
export interface CatalogItem {
  id: string;
  type: CatalogItemType;
  code: string | null;
  name: string;
  category: string | null;
  unit: string;
  description: string | null;
  /** Decimal string ("18.50", "0.00") or null — never a binary float. */
  cost_price: string | null;
  /** Decimal string or null. */
  sale_price: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Laravel's default paginate() JSON shape. */
export interface CatalogItemPaginationResponse {
  data: CatalogItem[];
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

/** POST /api/v1/catalog-items. */
export interface CatalogItemCreatePayload {
  type: CatalogItemType;
  code?: string | null;
  name: string;
  category?: string | null;
  unit: string;
  description?: string | null;
  cost_price?: string | null;
  sale_price?: string | null;
  active?: boolean;
}

/**
 * PUT /api/v1/catalog-items/{id} — a full snapshot of the item (§42): the
 * backend's UpdateCatalogItemRequest requires `type`/`name`/`unit` on
 * every PUT, so inactivating/reactivating must resend every current field,
 * never just `{ active: false }`.
 */
export type CatalogItemUpdatePayload = CatalogItemCreatePayload;

export interface CatalogItemListParams {
  search?: string;
  page?: number;
  perPage?: number;
  type?: CatalogItemType;
  active?: boolean;
}
