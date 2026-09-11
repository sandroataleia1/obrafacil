/**
 * Thin wrapper over `apiRequest` for the commercial catalog domain
 * (mirrors `features/customers/customers-client.ts`) — the only place in
 * the app allowed to know the `/api/v1/catalog-items` paths. There is
 * deliberately no `deleteCatalogItem` — the API has no DELETE route
 * (§39); the only "removal" is `updateCatalogItem(id, { ...payload,
 * active: false })`.
 */

import { apiRequest } from "@/lib/api-client";
import type {
  CatalogItem,
  CatalogItemCreatePayload,
  CatalogItemListParams,
  CatalogItemPaginationResponse,
  CatalogItemUpdatePayload,
} from "./types";

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listCatalogItems(params: CatalogItemListParams): Promise<CatalogItemPaginationResponse> {
  const query = buildQuery({
    search: params.search,
    page: params.page,
    per_page: params.perPage,
    type: params.type,
    active: params.active,
  });
  return apiRequest<CatalogItemPaginationResponse>(`/api/v1/catalog-items${query}`);
}

export function getCatalogItem(id: string): Promise<CatalogItem> {
  return apiRequest<CatalogItem>(`/api/v1/catalog-items/${encodeURIComponent(id)}`);
}

export function createCatalogItem(payload: CatalogItemCreatePayload): Promise<CatalogItem> {
  return apiRequest<CatalogItem>("/api/v1/catalog-items", { method: "POST", body: payload });
}

export function updateCatalogItem(id: string, payload: CatalogItemUpdatePayload): Promise<CatalogItem> {
  return apiRequest<CatalogItem>(`/api/v1/catalog-items/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });
}
