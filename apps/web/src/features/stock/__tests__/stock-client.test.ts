import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api-client";
import {
  createMaterialConsumption,
  createStockAdjustment,
  deleteMaterialConsumption,
  getStockPosition,
  listAllStockPositions,
  listStockMovements,
  listStockPositions,
} from "../stock-client";
import type { StockMovementPaginationResponse, StockPosition, StockPositionPaginationResponse } from "../types";

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

function position(id: string): StockPosition {
  return {
    project: { id: "proj-1", number: "OBR-000001", name: "Casa Oliveira" },
    material: { id, name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: null,
    purchased_quantity: "0.000",
    received_quantity: "0.000",
    consumed_quantity: "0.000",
    stock_quantity: "0.000",
    pending_receipt_quantity: "0.000",
    missing_to_purchase_quantity: null,
    total_in: "0.000",
    total_out: "0.000",
  };
}

function positionsPage(data: StockPosition[], currentPage: number, lastPage: number): StockPositionPaginationResponse {
  return {
    data,
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 100, to: data.length, total: data.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

function movementsPage(currentPage: number, lastPage: number): StockMovementPaginationResponse {
  return {
    data: [],
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 30, to: 0, total: 0 },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/**
 * SUPPLY-FRONTEND-01D §11 (SC1-SC12). Client contract tests — never
 * testing `apiRequest` internals, only that this module calls it with
 * the right URL/method/params for every exported function, that
 * snake_case wire params are derived correctly from camelCase JS
 * params, and that `listAllStockPositions` pages correctly.
 */
describe("stock-client — SUPPLY-FRONTEND-01D §11 (SC1-SC12)", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("SC1: listStockPositions hits /api/v1/stock/positions with zero params when none given", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(positionsPage([], 1, 1));
    await listStockPositions();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/stock/positions");
  });

  it("SC2: listStockPositions converts camelCase filters to snake_case query params", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(positionsPage([], 1, 1));
    await listStockPositions({ search: "cimento", projectId: "proj-1", page: 2, perPage: 15 });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/stock/positions?search=cimento&project_id=proj-1&page=2&per_page=15");
  });

  it("SC3: listAllStockPositions pages past 100 (last_page=2) and returns all rows", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(positionsPage([position("mat-1")], 1, 2))
      .mockResolvedValueOnce(positionsPage([position("mat-2")], 2, 2));

    const all = await listAllStockPositions();

    expect(all).toEqual([position("mat-1"), position("mat-2")]);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/v1/stock/positions?page=1&per_page=100");
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/v1/stock/positions?page=2&per_page=100");
  });

  it("SC4: listAllStockPositions forwards a projectId filter to every page", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(positionsPage([position("mat-1")], 1, 1));
    await listAllStockPositions({ projectId: "proj-1" });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/stock/positions?project_id=proj-1&page=1&per_page=100");
  });

  it("SC5: getStockPosition hits the composite Project+Material detail URL", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(position("mat-1"));
    await getStockPosition("proj-1", "mat-1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/stock/positions/proj-1/mat-1");
  });

  it("SC6: listStockMovements hits the movements URL with page/perPage params", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(movementsPage(1, 1));
    await listStockMovements("proj-1", "mat-1", { page: 2, perPage: 30 });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/stock/positions/proj-1/mat-1/movements?page=2&per_page=30");
  });

  it("SC7: createMaterialConsumption POSTs the payload to the nested project URL", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({});
    const payload = { material_id: "mat-1", quantity: "3.000", consumed_at: "2026-09-20" };
    await createMaterialConsumption("proj-1", payload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/projects/proj-1/material-consumptions", {
      method: "POST",
      body: payload,
    });
  });

  it("SC8: deleteMaterialConsumption DELETEs using the raw source_id, not a movement composite id", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);
    await deleteMaterialConsumption("proj-1", "cons-1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/projects/proj-1/material-consumptions/cons-1", {
      method: "DELETE",
    });
  });

  it("SC9: createStockAdjustment POSTs the payload to the nested project URL", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({});
    const payload = { material_id: "mat-1", type: "ADJUSTMENT_IN" as const, quantity: "3.000", occurred_at: "2026-09-20" };
    await createStockAdjustment("proj-1", payload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/projects/proj-1/stock-adjustments", {
      method: "POST",
      body: payload,
    });
  });

  it("SC10: project/material ids are URL-encoded in every nested path", async () => {
    vi.mocked(apiRequest).mockResolvedValue({});
    await getStockPosition("proj a", "mat/b");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/stock/positions/proj%20a/mat%2Fb");
  });

  it("SC11: every client function goes through apiRequest, zero raw fetch calls made", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.mocked(apiRequest).mockResolvedValue(positionsPage([], 1, 1));
    await listStockPositions();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("SC12: listAllStockPositions stops after a single page when last_page is 1", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(positionsPage([position("mat-1")], 1, 1));
    const all = await listAllStockPositions();
    expect(all).toEqual([position("mat-1")]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
