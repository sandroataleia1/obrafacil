/**
 * Thin wrapper over `apiRequest` for the real MaterialRequirement domain
 * (mirrors `features/materials/materials-client.ts`) — the only place in
 * the app allowed to know the nested
 * `/api/v1/projects/{project}/material-requirements` paths.
 */

import { apiRequest } from "@/lib/api-client";
import type {
  MaterialRequirement,
  MaterialRequirementCreatePayload,
  MaterialRequirementListParams,
  MaterialRequirementPaginationResponse,
  MaterialRequirementUpdatePayload,
} from "./types";

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listMaterialRequirements(
  projectId: string,
  params: MaterialRequirementListParams = {}
): Promise<MaterialRequirementPaginationResponse> {
  const query = buildQuery({ page: params.page, per_page: params.perPage });
  return apiRequest<MaterialRequirementPaginationResponse>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/material-requirements${query}`
  );
}

export function getMaterialRequirement(projectId: string, requirementId: string): Promise<MaterialRequirement> {
  return apiRequest<MaterialRequirement>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/material-requirements/${encodeURIComponent(requirementId)}`
  );
}

export function createMaterialRequirement(
  projectId: string,
  payload: MaterialRequirementCreatePayload
): Promise<MaterialRequirement> {
  return apiRequest<MaterialRequirement>(`/api/v1/projects/${encodeURIComponent(projectId)}/material-requirements`, {
    method: "POST",
    body: payload,
  });
}

export function updateMaterialRequirement(
  projectId: string,
  requirementId: string,
  payload: MaterialRequirementUpdatePayload
): Promise<MaterialRequirement> {
  return apiRequest<MaterialRequirement>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/material-requirements/${encodeURIComponent(requirementId)}`,
    { method: "PUT", body: payload }
  );
}

export function deleteMaterialRequirement(projectId: string, requirementId: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/material-requirements/${encodeURIComponent(requirementId)}`,
    { method: "DELETE" }
  );
}

const ALL_PAGES_PER_PAGE = 100;

/**
 * Transitional helper for the planning selector/lookup contexts that need
 * the FULL set of Requirements for a Project (never assume <=100 per
 * Obra — pages internally with `per_page=100` until `meta.last_page`).
 */
export async function listAllMaterialRequirements(projectId: string): Promise<MaterialRequirement[]> {
  const first = await listMaterialRequirements(projectId, { page: 1, perPage: ALL_PAGES_PER_PAGE });
  const all = [...first.data];
  let page = 2;
  while (page <= first.meta.last_page) {
    const next = await listMaterialRequirements(projectId, { page, perPage: ALL_PAGES_PER_PAGE });
    all.push(...next.data);
    page += 1;
  }
  return all;
}
