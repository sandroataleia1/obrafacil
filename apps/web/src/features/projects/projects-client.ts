/**
 * Thin wrapper over `apiRequest` for the real Obras (Project) domain
 * (mirrors `features/service-orders/service-orders-client.ts` and
 * `features/customers/customers-client.ts`) — the only place in the app
 * allowed to know the `/api/v1/projects` paths. Every caller (list/
 * create/edit/detail pages, and every dependent module's Obra selector)
 * goes through here — never a raw `fetch`.
 *
 * There is deliberately no `deleteProject` — the API has no DELETE route
 * for a Project in v1 (ADR-016).
 */

import { apiRequest } from "@/lib/api-client";
import type {
  Project,
  ProjectCreatePayload,
  ProjectListItem,
  ProjectListParams,
  ProjectPaginationResponse,
  ProjectUpdatePayload,
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

export function listProjects(params: ProjectListParams): Promise<ProjectPaginationResponse> {
  const query = buildQuery({
    search: params.search,
    page: params.page,
    per_page: params.perPage,
    status: params.status,
  });
  return apiRequest<ProjectPaginationResponse>(`/api/v1/projects${query}`);
}

export function getProject(id: string): Promise<Project> {
  return apiRequest<Project>(`/api/v1/projects/${encodeURIComponent(id)}`);
}

export function createProject(payload: ProjectCreatePayload): Promise<Project> {
  return apiRequest<Project>("/api/v1/projects", { method: "POST", body: payload });
}

export function updateProject(id: string, payload: ProjectUpdatePayload): Promise<Project> {
  return apiRequest<Project>(`/api/v1/projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });
}

const ALL_PAGES_PER_PAGE = 100;

/**
 * Transitional helper for modules that still need the FULL set of
 * Projects for a selector/summary (never the main `/obras` list, which
 * always uses real server-side pagination — see `ProjectList`). Pages
 * internally with `per_page=100` until `last_page` is reached, so a
 * Company with more than 100 Obras is never silently truncated to the
 * first page. PostgreSQL/the API remains the sole source of truth either
 * way — this never falls back to any local cache.
 */
export async function listAllProjectsFromApi(): Promise<ProjectListItem[]> {
  const first = await listProjects({ page: 1, perPage: ALL_PAGES_PER_PAGE });
  const all = [...first.data];
  let page = 2;
  while (page <= first.meta.last_page) {
    const next = await listProjects({ page, perPage: ALL_PAGES_PER_PAGE });
    all.push(...next.data);
    page += 1;
  }
  return all;
}
