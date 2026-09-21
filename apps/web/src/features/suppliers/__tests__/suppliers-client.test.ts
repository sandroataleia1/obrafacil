import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api-client";
import {
  createSupplier,
  deleteSupplier,
  listAllSuppliersFromApi,
  listSuppliers,
  updateSupplier,
} from "../suppliers-client";
import type { Supplier, SupplierListItem, SupplierPaginationResponse } from "../types";

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

function item(id: string): SupplierListItem {
  return { id, name: `Fornecedor ${id}`, document: null, contact_name: null, phone: null, active: true, updated_at: "2026-09-10T00:00:00Z" };
}

function page(data: SupplierListItem[], currentPage: number, lastPage: number): SupplierPaginationResponse {
  return {
    data,
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 100, to: data.length, total: data.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/**
 * SUPPLY-FRONTEND-01A1 §15-16. SF7: real (not audit-only) proof that
 * `listAllSuppliersFromApi` pages internally at `per_page=100` until
 * `meta.last_page`. Plus client contract tests for list/create/update/
 * delete.
 */
describe("suppliers-client — SUPPLY-FRONTEND-01A1 §15-16 (SF7)", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("SF7: listAllSuppliersFromApi pages through last_page=2 at per_page=100 and returns all rows", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(page([item("s1")], 1, 2))
      .mockResolvedValueOnce(page([item("s2")], 2, 2));

    const all = await listAllSuppliersFromApi();

    expect(all).toEqual([item("s1"), item("s2")]);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/v1/suppliers?page=1&per_page=100");
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/v1/suppliers?page=2&per_page=100");
  });

  it("SF7: a single-page result (last_page=1) issues exactly one request", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(page([item("s1")], 1, 1));
    const all = await listAllSuppliersFromApi();
    expect(all).toEqual([item("s1")]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("list: sends search/page/per_page/active as query params", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(page([], 1, 1));
    await listSuppliers({ search: "silva", page: 2, perPage: 15, active: true });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/suppliers?search=silva&page=2&per_page=15&active=true");
  });

  it("create: POSTs to /api/v1/suppliers with the payload", async () => {
    const created: Supplier = {
      id: "s1",
      name: "Casa Silva",
      document: null,
      contact_name: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      active: true,
      created_at: "2026-09-10T00:00:00Z",
      updated_at: "2026-09-10T00:00:00Z",
    };
    vi.mocked(apiRequest).mockResolvedValueOnce(created);
    const payload = { name: "Casa Silva" };
    const result = await createSupplier(payload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/suppliers", { method: "POST", body: payload });
    expect(result).toBe(created);
  });

  it("update: PUTs to /api/v1/suppliers/{id} with the payload", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({} as Supplier);
    const payload = { name: "Casa Silva", active: false };
    await updateSupplier("s1", payload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/suppliers/s1", { method: "PUT", body: payload });
  });

  it("delete: DELETEs /api/v1/suppliers/{id}", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);
    await deleteSupplier("s1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/suppliers/s1", { method: "DELETE" });
  });
});
