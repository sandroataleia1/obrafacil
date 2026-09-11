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
  ServiceOrderListParams,
  ServiceOrderPaginationResponse,
  ServiceOrderSettings,
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
