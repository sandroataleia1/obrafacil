/**
 * Thin wrapper over `apiRequest` for the real Orçamentos (Budgets)
 * domain (mirrors `features/service-orders/service-orders-client.ts` and
 * `features/customers/customers-client.ts`) — the only place in the app
 * allowed to know the authenticated `/api/v1/budgets` paths. Every
 * caller (list/create/detail/edit pages, item dialogs) goes through
 * here — never a raw `fetch`.
 *
 * There is deliberately no `deleteBudget` — the API has no DELETE route
 * for a Budget (§56).
 */

import { apiBlobRequest, apiRequest } from "@/lib/api-client";
import type {
  ApproveBudgetManuallyPayload,
  Budget,
  BudgetCreatePayload,
  BudgetItem,
  BudgetItemAddPayload,
  BudgetItemUpdatePayload,
  BudgetListParams,
  BudgetPaginationResponse,
  BudgetUpdatePayload,
  RejectBudgetManuallyPayload,
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

export function listBudgets(params: BudgetListParams): Promise<BudgetPaginationResponse> {
  const query = buildQuery({
    search: params.search,
    status: params.status,
    page: params.page,
    per_page: params.perPage,
  });
  return apiRequest<BudgetPaginationResponse>(`/api/v1/budgets${query}`);
}

export function getBudget(id: string): Promise<Budget> {
  return apiRequest<Budget>(`/api/v1/budgets/${encodeURIComponent(id)}`);
}

export function createBudget(payload: BudgetCreatePayload): Promise<Budget> {
  return apiRequest<Budget>("/api/v1/budgets", { method: "POST", body: payload });
}

/** Header-only update — draft only (409 if the Budget is no longer draft). */
export function updateBudget(id: string, payload: BudgetUpdatePayload): Promise<Budget> {
  return apiRequest<Budget>(`/api/v1/budgets/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });
}

/**
 * GET /api/v1/budgets/{id}/proposal-preview.pdf — works for a draft
 * (built fresh from the live Company) and for a submitted Budget (built
 * from the frozen historical snapshot). Never a POST, never touches
 * status/token (§27/§29).
 */
export function getBudgetProposalPdf(id: string): Promise<Blob> {
  return apiBlobRequest(`/api/v1/budgets/${encodeURIComponent(id)}/proposal-preview.pdf`);
}

export function submitBudget(id: string): Promise<Budget> {
  return apiRequest<Budget>(`/api/v1/budgets/${encodeURIComponent(id)}/submit`, { method: "POST" });
}

export function approveBudgetManually(
  id: string,
  payload: ApproveBudgetManuallyPayload
): Promise<Budget> {
  return apiRequest<Budget>(`/api/v1/budgets/${encodeURIComponent(id)}/approve-manually`, {
    method: "POST",
    body: payload,
  });
}

export function rejectBudgetManually(
  id: string,
  payload: RejectBudgetManuallyPayload
): Promise<Budget> {
  return apiRequest<Budget>(`/api/v1/budgets/${encodeURIComponent(id)}/reject-manually`, {
    method: "POST",
    body: payload,
  });
}

/**
 * Adds one line item. Returns only the created `BudgetItem` — NOT the
 * parent's new totals; callers must re-GET the Budget afterward for
 * server-authoritative `sale_subtotal`/`cost_subtotal`/`margin_amount`/
 * `margin_percentage`/`total`/`updated_at` (§50).
 */
export function addBudgetItem(budgetId: string, payload: BudgetItemAddPayload): Promise<BudgetItem> {
  return apiRequest<BudgetItem>(`/api/v1/budgets/${encodeURIComponent(budgetId)}/items`, {
    method: "POST",
    body: payload,
  });
}

/**
 * Updates one line item's quantity/unit_price/line_discount/notes/
 * sort_order only. Returns only the updated `BudgetItem`, never the
 * parent's totals — the caller must re-GET the Budget afterward (§50).
 */
export function updateBudgetItem(
  budgetId: string,
  itemId: string,
  payload: BudgetItemUpdatePayload
): Promise<BudgetItem> {
  return apiRequest<BudgetItem>(
    `/api/v1/budgets/${encodeURIComponent(budgetId)}/items/${encodeURIComponent(itemId)}`,
    { method: "PUT", body: payload }
  );
}

/** Removes one line item. Returns nothing (204). */
export function deleteBudgetItem(budgetId: string, itemId: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/budgets/${encodeURIComponent(budgetId)}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" }
  );
}
