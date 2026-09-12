/**
 * Thin wrapper over `apiRequest` for the real Ordens de serviço (O.S.)
 * domain (mirrors `features/customers/customers-client.ts` and
 * `features/catalog/catalog-client.ts`) — the only place in the app
 * allowed to know the `/api/v1/service-orders` paths. Every caller
 * (list/detail/wizard) goes through here — never a raw `fetch`.
 *
 * There is deliberately no `deleteServiceOrder` — the API has no DELETE
 * route for a service order.
 */

import { apiRequest } from "@/lib/api-client";
import type {
  ServiceOrder,
  ServiceOrderCreatePayload,
  ServiceOrderItem,
  ServiceOrderItemCreatePayload,
  ServiceOrderItemUpdatePayload,
  ServiceOrderListParams,
  ServiceOrderPaginationResponse,
  ServiceOrderSettings,
  ServiceOrderUpdatePayload,
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

export function listServiceOrders(params: ServiceOrderListParams): Promise<ServiceOrderPaginationResponse> {
  const query = buildQuery({
    search: params.search,
    page: params.page,
    per_page: params.perPage,
    status: params.status,
  });
  return apiRequest<ServiceOrderPaginationResponse>(`/api/v1/service-orders${query}`);
}

export function getServiceOrder(id: string): Promise<ServiceOrder> {
  return apiRequest<ServiceOrder>(`/api/v1/service-orders/${encodeURIComponent(id)}`);
}

export function createServiceOrder(payload: ServiceOrderCreatePayload): Promise<ServiceOrder> {
  return apiRequest<ServiceOrder>("/api/v1/service-orders", { method: "POST", body: payload });
}

/**
 * Header-only update — never touches items or status. Returns the full
 * `ServiceOrder` (with `items`) on success. Throws `ApiError` with
 * status 409 if the order has since become `completed`/`cancelled`.
 */
export function updateServiceOrder(id: string, payload: ServiceOrderUpdatePayload): Promise<ServiceOrder> {
  return apiRequest<ServiceOrder>(`/api/v1/service-orders/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });
}

/**
 * Adds one line item. Returns only the created `ServiceOrderItem` — NOT
 * the parent's new totals; callers must re-GET the order afterward for
 * server-authoritative `subtotal`/`total`/`updated_at`.
 */
export function addServiceOrderItem(
  orderId: string,
  payload: ServiceOrderItemCreatePayload
): Promise<ServiceOrderItem> {
  return apiRequest<ServiceOrderItem>(`/api/v1/service-orders/${encodeURIComponent(orderId)}/items`, {
    method: "POST",
    body: payload,
  });
}

/**
 * Updates one line item's quantity/price/discount/notes only — never
 * `catalog_item_id` (prohibited by the backend; to swap the underlying
 * product/service, remove this line and add a new one). Returns only the
 * updated `ServiceOrderItem`, never the parent's totals.
 */
export function updateServiceOrderItem(
  orderId: string,
  itemId: string,
  payload: ServiceOrderItemUpdatePayload
): Promise<ServiceOrderItem> {
  return apiRequest<ServiceOrderItem>(
    `/api/v1/service-orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
    { method: "PUT", body: payload }
  );
}

/** Removes one line item. Returns nothing (204). */
export function deleteServiceOrderItem(orderId: string, itemId: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/service-orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" }
  );
}

export function getServiceOrderSettings(): Promise<ServiceOrderSettings> {
  return apiRequest<ServiceOrderSettings>("/api/v1/service-orders/settings");
}

export function updateServiceOrderSettings(payload: ServiceOrderSettings): Promise<ServiceOrderSettings> {
  return apiRequest<ServiceOrderSettings>("/api/v1/service-orders/settings", { method: "PUT", body: payload });
}

export function startServiceOrder(id: string): Promise<ServiceOrder> {
  return apiRequest<ServiceOrder>(`/api/v1/service-orders/${encodeURIComponent(id)}/start`, { method: "POST" });
}

export function completeServiceOrder(id: string): Promise<ServiceOrder> {
  return apiRequest<ServiceOrder>(`/api/v1/service-orders/${encodeURIComponent(id)}/complete`, { method: "POST" });
}

export function cancelServiceOrder(id: string, reason: string): Promise<ServiceOrder> {
  return apiRequest<ServiceOrder>(`/api/v1/service-orders/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: { reason },
  });
}
