import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api-client";
import {
  createMaterial,
  deleteMaterial,
  listAllMaterialsFromApi,
  listMaterials,
  updateMaterial,
} from "../materials-client";
import type { Material, MaterialListItem, MaterialPaginationResponse } from "../types";

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

function item(id: string): MaterialListItem {
  return { id, name: `Material ${id}`, unit_code: "un", unit_custom_label: null, active: true, updated_at: "2026-09-10T00:00:00Z" };
}

function page(data: MaterialListItem[], currentPage: number, lastPage: number): MaterialPaginationResponse {
  return {
    data,
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 100, to: data.length, total: data.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/**
 * SUPPLY-FRONTEND-01A1 §15-16. MF8: real (not audit-only) proof that
 * `listAllMaterialsFromApi` pages internally at `per_page=100` until
 * `meta.last_page`. Plus client contract tests for list/create/update/
 * delete — never testing `apiRequest` internals, only that this module
 * calls it with the right method/path/params.
 */
describe("materials-client — SUPPLY-FRONTEND-01A1 §15-16 (MF8)", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("MF8: listAllMaterialsFromApi pages through last_page=2 at per_page=100 and returns all rows", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(page([item("m1")], 1, 2))
      .mockResolvedValueOnce(page([item("m2")], 2, 2));

    const all = await listAllMaterialsFromApi();

    expect(all).toEqual([item("m1"), item("m2")]);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/v1/materials?page=1&per_page=100");
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/v1/materials?page=2&per_page=100");
  });

  it("MF8: a single-page result (last_page=1) issues exactly one request", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(page([item("m1")], 1, 1));
    const all = await listAllMaterialsFromApi();
    expect(all).toEqual([item("m1")]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("list: sends search/page/per_page/active as query params", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(page([], 1, 1));
    await listMaterials({ search: "cimento", page: 2, perPage: 15, active: true });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/materials?search=cimento&page=2&per_page=15&active=true");
  });

  it("create: POSTs to /api/v1/materials with the payload", async () => {
    const created: Material = {
      id: "m1",
      name: "Cimento",
      unit_code: "sc",
      unit_custom_label: null,
      notes: null,
      active: true,
      created_at: "2026-09-10T00:00:00Z",
      updated_at: "2026-09-10T00:00:00Z",
    };
    vi.mocked(apiRequest).mockResolvedValueOnce(created);
    const payload = { name: "Cimento", unit_code: "sc" as const };
    const result = await createMaterial(payload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/materials", { method: "POST", body: payload });
    expect(result).toBe(created);
  });

  it("update: PUTs to /api/v1/materials/{id} with the payload", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({} as Material);
    const payload = { name: "Cimento", unit_code: "sc" as const, active: false };
    await updateMaterial("m1", payload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/materials/m1", { method: "PUT", body: payload });
  });

  it("delete: DELETEs /api/v1/materials/{id}", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);
    await deleteMaterial("m1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/materials/m1", { method: "DELETE" });
  });
});
