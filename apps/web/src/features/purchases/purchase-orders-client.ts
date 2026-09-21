/**
 * Thin wrapper over `apiRequest` for the real PurchaseOrder/
 * PurchaseOrderItem/GoodsReceipt domain (mirrors
 * `features/materials/materials-client.ts` /
 * `material-requirements-client.ts`) — the only place in the app allowed
 * to know the `/api/v1/purchase-orders` paths. Every caller goes through
 * here — never a raw `fetch`.
 *
 * `updated_at` tokens are passed through verbatim in every payload/body
 * that needs them — never parsed, reformatted, or defaulted here.
 */

import { apiRequest } from "@/lib/api-client";
import type {
  GoodsReceipt,
  GoodsReceiptCreatePayload,
  PurchaseOrder,
  PurchaseOrderConcurrencyPayload,
  PurchaseOrderCreatePayload,
  PurchaseOrderItem,
  PurchaseOrderItemCreatePayload,
  PurchaseOrderItemUpdatePayload,
  PurchaseOrderListItem,
  PurchaseOrderListParams,
  PurchaseOrderPaginationResponse,
  PurchaseOrderUpdatePayload,
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

export function listPurchaseOrders(params: PurchaseOrderListParams = {}): Promise<PurchaseOrderPaginationResponse> {
  const query = buildQuery({
    search: params.search,
    commercial_status: params.commercialStatus,
    project_id: params.projectId,
    supplier_id: params.supplierId,
    page: params.page,
    per_page: params.perPage,
  });
  return apiRequest<PurchaseOrderPaginationResponse>(`/api/v1/purchase-orders${query}`);
}

const ALL_PAGES_PER_PAGE = 100;

/**
 * Transitional helper for selector/lookup/planning contexts that need the
 * FULL set of PurchaseOrders for a filter (never assume <=100 — pages
 * internally with `per_page=100` until `meta.last_page`).
 */
export async function listAllPurchaseOrders(
  params: Omit<PurchaseOrderListParams, "page" | "perPage"> = {}
): Promise<PurchaseOrderListItem[]> {
  const first = await listPurchaseOrders({ ...params, page: 1, perPage: ALL_PAGES_PER_PAGE });
  const all = [...first.data];
  let page = 2;
  while (page <= first.meta.last_page) {
    const next = await listPurchaseOrders({ ...params, page, perPage: ALL_PAGES_PER_PAGE });
    all.push(...next.data);
    page += 1;
  }
  return all;
}

export function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`/api/v1/purchase-orders/${encodeURIComponent(id)}`);
}

/**
 * TRANSITIONAL bridge only (SUPPLY-FRONTEND-01C §41-42), for the
 * material-planning consumers that still need item/receipt-level detail
 * per PurchaseOrder for one Project (`ProjectRequirementList`,
 * `ProjectDetail`) — there is no list endpoint that returns item/receipt
 * detail inline, so this fans out one `getPurchaseOrder` per row after
 * `listAllPurchaseOrders`. Removed in SUPPLY-FRONTEND-01D once
 * Stock/Consumption/planning read a real backend aggregate instead. A
 * failure on ANY detail fetch rejects the whole call — never silently
 * substitutes a partial list, which would otherwise fabricate an
 * incomplete "purchased"/"received" planning figure.
 */
export async function listPurchaseOrderDetailsForProject(projectId: string): Promise<PurchaseOrder[]> {
  const rows = await listAllPurchaseOrders({ projectId });
  return Promise.all(rows.map((row) => getPurchaseOrder(row.id)));
}

/**
 * Frontend-only fan-out for callers that need PurchaseOrder detail
 * across SEVERAL already-resolved Projects (Executive Panel) — mirrors
 * `material-requirements-client.ts#listMaterialRequirementsForProjects`.
 * A failure on ANY Project's fetch rejects the whole call.
 */
export async function listPurchaseOrderDetailsForProjects(projectIds: string[]): Promise<Map<string, PurchaseOrder[]>> {
  const entries = await Promise.all(
    projectIds.map(async (projectId) => [projectId, await listPurchaseOrderDetailsForProject(projectId)] as const)
  );
  return new Map(entries);
}

export function createPurchaseOrder(payload: PurchaseOrderCreatePayload): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>("/api/v1/purchase-orders", { method: "POST", body: payload });
}

export function updatePurchaseOrder(id: string, payload: PurchaseOrderUpdatePayload): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`/api/v1/purchase-orders/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });
}

export function deletePurchaseOrder(id: string, payload: PurchaseOrderConcurrencyPayload): Promise<void> {
  return apiRequest<void>(`/api/v1/purchase-orders/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: payload,
  });
}

export function confirmPurchaseOrder(id: string, payload: PurchaseOrderConcurrencyPayload): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`/api/v1/purchase-orders/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: payload,
  });
}

export function cancelPurchaseOrder(id: string, payload: PurchaseOrderConcurrencyPayload): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`/api/v1/purchase-orders/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: payload,
  });
}

export function returnPurchaseOrderToDraft(
  id: string,
  payload: PurchaseOrderConcurrencyPayload
): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`/api/v1/purchase-orders/${encodeURIComponent(id)}/return-to-draft`, {
    method: "POST",
    body: payload,
  });
}

export function createPurchaseOrderItem(
  orderId: string,
  payload: PurchaseOrderItemCreatePayload
): Promise<PurchaseOrderItem> {
  return apiRequest<PurchaseOrderItem>(`/api/v1/purchase-orders/${encodeURIComponent(orderId)}/items`, {
    method: "POST",
    body: payload,
  });
}

export function updatePurchaseOrderItem(
  orderId: string,
  itemId: string,
  payload: PurchaseOrderItemUpdatePayload
): Promise<PurchaseOrderItem> {
  return apiRequest<PurchaseOrderItem>(
    `/api/v1/purchase-orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
    { method: "PUT", body: payload }
  );
}

/** Item DELETE has no body/`updated_at` requirement at all. */
export function deletePurchaseOrderItem(orderId: string, itemId: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/purchase-orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" }
  );
}

export function createGoodsReceipt(orderId: string, payload: GoodsReceiptCreatePayload): Promise<GoodsReceipt> {
  return apiRequest<GoodsReceipt>(`/api/v1/purchase-orders/${encodeURIComponent(orderId)}/goods-receipts`, {
    method: "POST",
    body: payload,
  });
}

/** No `updated_at` requirement — backend enforces its own chronology guard (422 on violation). */
export function deleteGoodsReceipt(orderId: string, receiptId: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/purchase-orders/${encodeURIComponent(orderId)}/goods-receipts/${encodeURIComponent(receiptId)}`,
    { method: "DELETE" }
  );
}
