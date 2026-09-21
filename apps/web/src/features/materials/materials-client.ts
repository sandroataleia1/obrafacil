/**
 * Thin wrapper over `apiRequest` for the real Material catalog domain
 * (mirrors `features/projects/projects-client.ts`) — the only place in
 * the app allowed to know the `/api/v1/materials` paths. Every caller
 * (list/create/edit/detail pages, and every dependent module's Material
 * selector) goes through here — never a raw `fetch`.
 */

import { apiRequest } from "@/lib/api-client";
import type {
  Material,
  MaterialCreatePayload,
  MaterialListItem,
  MaterialListParams,
  MaterialPaginationResponse,
  MaterialUpdatePayload,
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

export function listMaterials(params: MaterialListParams): Promise<MaterialPaginationResponse> {
  const query = buildQuery({
    search: params.search,
    page: params.page,
    per_page: params.perPage,
    active: params.active,
  });
  return apiRequest<MaterialPaginationResponse>(`/api/v1/materials${query}`);
}

export function getMaterial(id: string): Promise<Material> {
  return apiRequest<Material>(`/api/v1/materials/${encodeURIComponent(id)}`);
}

export function createMaterial(payload: MaterialCreatePayload): Promise<Material> {
  return apiRequest<Material>("/api/v1/materials", { method: "POST", body: payload });
}

export function updateMaterial(id: string, payload: MaterialUpdatePayload): Promise<Material> {
  return apiRequest<Material>(`/api/v1/materials/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });
}

export function deleteMaterial(id: string): Promise<void> {
  return apiRequest<void>(`/api/v1/materials/${encodeURIComponent(id)}`, { method: "DELETE" });
}

const ALL_PAGES_PER_PAGE = 100;

/**
 * Transitional helper for modules that still need the FULL set of
 * Materials for a selector/lookup (never the main `/materiais` list,
 * which always uses real server-side pagination — see `MaterialList`).
 * Pages internally with `per_page=100` until `last_page` is reached, so
 * a Company with more than 100 Materials is never silently truncated.
 * PostgreSQL/the API remains the sole source of truth either way — this
 * never falls back to any local cache.
 */
export async function listAllMaterialsFromApi(params: { active?: boolean } = {}): Promise<MaterialListItem[]> {
  const first = await listMaterials({ page: 1, perPage: ALL_PAGES_PER_PAGE, active: params.active });
  const all = [...first.data];
  let page = 2;
  while (page <= first.meta.last_page) {
    const next = await listMaterials({ page, perPage: ALL_PAGES_PER_PAGE, active: params.active });
    all.push(...next.data);
    page += 1;
  }
  return all;
}
