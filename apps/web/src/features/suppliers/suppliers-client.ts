/**
 * Thin wrapper over `apiRequest` for the real Supplier domain (mirrors
 * `features/materials/materials-client.ts`) — the only place in the app
 * allowed to know the `/api/v1/suppliers` paths.
 */

import { apiRequest } from "@/lib/api-client";
import type {
  Supplier,
  SupplierCreatePayload,
  SupplierListItem,
  SupplierListParams,
  SupplierPaginationResponse,
  SupplierUpdatePayload,
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

export function listSuppliers(params: SupplierListParams): Promise<SupplierPaginationResponse> {
  const query = buildQuery({
    search: params.search,
    page: params.page,
    per_page: params.perPage,
    active: params.active,
  });
  return apiRequest<SupplierPaginationResponse>(`/api/v1/suppliers${query}`);
}

export function getSupplier(id: string): Promise<Supplier> {
  return apiRequest<Supplier>(`/api/v1/suppliers/${encodeURIComponent(id)}`);
}

export function createSupplier(payload: SupplierCreatePayload): Promise<Supplier> {
  return apiRequest<Supplier>("/api/v1/suppliers", { method: "POST", body: payload });
}

export function updateSupplier(id: string, payload: SupplierUpdatePayload): Promise<Supplier> {
  return apiRequest<Supplier>(`/api/v1/suppliers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });
}

export function deleteSupplier(id: string): Promise<void> {
  return apiRequest<void>(`/api/v1/suppliers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

const ALL_PAGES_PER_PAGE = 100;

/**
 * Transitional helper for modules that still need the FULL set of
 * Suppliers for a selector/lookup (never the main `/fornecedores` list,
 * which always uses real server-side pagination). Pages internally with
 * `per_page=100` until `last_page` is reached.
 */
export async function listAllSuppliersFromApi(params: { active?: boolean } = {}): Promise<SupplierListItem[]> {
  const first = await listSuppliers({ page: 1, perPage: ALL_PAGES_PER_PAGE, active: params.active });
  const all = [...first.data];
  let page = 2;
  while (page <= first.meta.last_page) {
    const next = await listSuppliers({ page, perPage: ALL_PAGES_PER_PAGE, active: params.active });
    all.push(...next.data);
    page += 1;
  }
  return all;
}
