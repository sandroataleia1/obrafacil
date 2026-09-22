/**
 * Thin wrapper over `apiRequest` for the real Stock/Consumption/
 * Adjustment domain (mirrors `features/purchases/purchase-orders-client.ts`)
 * — the only place in the app allowed to know the `/api/v1/stock`,
 * `/api/v1/projects/{project}/material-consumptions`, and
 * `/api/v1/projects/{project}/stock-adjustments` paths. Every caller
 * goes through here — never a raw `fetch`.
 *
 * There is no GET for a single MaterialConsumption/StockAdjustment
 * (none exists on the backend) — `StockMovement` (via
 * `listStockMovements`) is the canonical history; a Consumption is
 * deleted using `movement.source_id` (SUPPLY-FRONTEND-01D §12). There is
 * no DELETE for StockAdjustment either — it is append-only for its
 * entire lifetime (§13); a correction is a new, opposite adjustment.
 */

import { apiRequest } from "@/lib/api-client";
import type {
  MaterialConsumption,
  MaterialConsumptionCreatePayload,
  StockAdjustment,
  StockAdjustmentCreatePayload,
  StockMovementListParams,
  StockMovementPaginationResponse,
  StockPosition,
  StockPositionListParams,
  StockPositionPaginationResponse,
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

export function listStockPositions(params: StockPositionListParams = {}): Promise<StockPositionPaginationResponse> {
  const query = buildQuery({
    search: params.search,
    project_id: params.projectId,
    page: params.page,
    per_page: params.perPage,
  });
  return apiRequest<StockPositionPaginationResponse>(`/api/v1/stock/positions${query}`);
}

const ALL_PAGES_PER_PAGE = 100;

/**
 * Transitional (and general-purpose) helper for callers that need the
 * FULL set of StockPositions across a Company (Executive Panel,
 * Analytics, ProjectDetail) — pages internally with `per_page=100`
 * until `meta.last_page`, never assumes <=100 pairs. Never fans out per
 * Project — a single, filtered/unfiltered company-wide read (§38).
 */
export async function listAllStockPositions(
  params: Omit<StockPositionListParams, "page" | "perPage"> = {}
): Promise<StockPosition[]> {
  const first = await listStockPositions({ ...params, page: 1, perPage: ALL_PAGES_PER_PAGE });
  const all = [...first.data];
  let page = 2;
  while (page <= first.meta.last_page) {
    const next = await listStockPositions({ ...params, page, perPage: ALL_PAGES_PER_PAGE });
    all.push(...next.data);
    page += 1;
  }
  return all;
}

export function getStockPosition(projectId: string, materialId: string): Promise<StockPosition> {
  return apiRequest<StockPosition>(
    `/api/v1/stock/positions/${encodeURIComponent(projectId)}/${encodeURIComponent(materialId)}`
  );
}

export function listStockMovements(
  projectId: string,
  materialId: string,
  params: StockMovementListParams = {}
): Promise<StockMovementPaginationResponse> {
  const query = buildQuery({ page: params.page, per_page: params.perPage });
  return apiRequest<StockMovementPaginationResponse>(
    `/api/v1/stock/positions/${encodeURIComponent(projectId)}/${encodeURIComponent(materialId)}/movements${query}`
  );
}

export function createMaterialConsumption(
  projectId: string,
  payload: MaterialConsumptionCreatePayload
): Promise<MaterialConsumption> {
  return apiRequest<MaterialConsumption>(`/api/v1/projects/${encodeURIComponent(projectId)}/material-consumptions`, {
    method: "POST",
    body: payload,
  });
}

export function deleteMaterialConsumption(projectId: string, consumptionId: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/material-consumptions/${encodeURIComponent(consumptionId)}`,
    { method: "DELETE" }
  );
}

export function createStockAdjustment(
  projectId: string,
  payload: StockAdjustmentCreatePayload
): Promise<StockAdjustment> {
  return apiRequest<StockAdjustment>(`/api/v1/projects/${encodeURIComponent(projectId)}/stock-adjustments`, {
    method: "POST",
    body: payload,
  });
}
