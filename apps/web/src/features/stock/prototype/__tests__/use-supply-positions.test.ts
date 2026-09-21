import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

const projectsState: { projects: unknown[] | undefined; error: boolean } = { projects: [], error: false };
const reloadProjects = vi.fn();
vi.mock("@/features/projects/use-all-projects", () => ({
  useAllProjects: () => ({ projects: projectsState.projects, error: projectsState.error, reload: reloadProjects }),
}));

vi.mock("@/features/materials/material-requirements-client", () => ({
  listMaterialRequirementsForProjects: vi.fn(),
}));

// Isolate the Requirement-union behavior from Estoque V1's own seed data —
// physical stock positions and local PurchaseOrders are irrelevant here.
vi.mock("../stock", () => ({ listStockPositions: () => [] }));
vi.mock("@/features/purchases/prototype/purchase-order-store", () => ({
  listPurchaseOrders: () => [],
  listPurchaseOrdersByProject: () => [],
}));
vi.mock("@/features/purchases/prototype/purchase-order-item-store", () => ({
  listItemsByPurchaseOrder: () => [],
  listItemsByPurchaseOrders: () => [],
}));
vi.mock("@/features/purchases/prototype/goods-receipt-item-store", () => ({
  listReceiptItemsByPurchaseOrder: () => [],
}));
vi.mock("@/features/materials/prototype/material-consumption-store", () => ({
  listConsumptionsByProject: () => [],
}));
vi.mock("@/features/materials/prototype/material-consumption", () => ({
  calculateAvailableQuantity: () => 0,
}));

import { listMaterialRequirementsForProjects } from "@/features/materials/material-requirements-client";
import { useSupplyPositions } from "../use-supply-positions";
import type { MaterialRequirement } from "@/features/materials/types";

function project(id: string) {
  return { id, name: `Obra ${id}` };
}

function requirement(id: string, projectId: string, materialId: string): MaterialRequirement {
  return {
    id,
    project_id: projectId,
    material: { id: materialId, name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: "1.000",
    notes: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

/**
 * SUPPLY-FRONTEND-01B1 §16-18/§29 (ST1-ST8). `useSupplyPositions()` is
 * now an async, tenant-safe bridge over the real Requirement API instead
 * of a synchronous localStorage read.
 */
describe("useSupplyPositions — SUPPLY-FRONTEND-01B1 §29 (ST1-ST8)", () => {
  beforeEach(() => {
    vi.mocked(listMaterialRequirementsForProjects).mockReset().mockResolvedValue(new Map());
    reloadProjects.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    projectsState.projects = [project("p1")];
    projectsState.error = false;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ST1: a planned-only real Requirement creates a position with required set", async () => {
    vi.mocked(listMaterialRequirementsForProjects).mockResolvedValue(
      new Map([["p1", [requirement("r1", "p1", "mat-1")]]])
    );
    const { result } = renderHook(() => useSupplyPositions());
    await waitFor(() => expect(result.current.positions).not.toBeUndefined());
    const position = result.current.positions!.find((p) => p.materialId === "mat-1" && p.projectId === "p1");
    expect(position?.required).toBe(1);
  });

  it("ST2: zero API Requirements never creates a phantom planned position", async () => {
    vi.mocked(listMaterialRequirementsForProjects).mockResolvedValue(new Map());
    const { result } = renderHook(() => useSupplyPositions());
    await waitFor(() => expect(result.current.positions).not.toBeUndefined());
    expect(result.current.positions).toEqual([]);
  });

  it("ST4: a Requirements-API failure never resolves positions with required computed as null", async () => {
    vi.mocked(listMaterialRequirementsForProjects).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useSupplyPositions());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.positions).toBeUndefined();
  });

  it("ST7: switching Company clears positions until the new response resolves", async () => {
    vi.mocked(listMaterialRequirementsForProjects).mockResolvedValue(
      new Map([["p1", [requirement("r1", "p1", "mat-1")]]])
    );
    const { result, rerender } = renderHook(() => useSupplyPositions());
    await waitFor(() => expect(result.current.positions).not.toBeUndefined());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    projectsState.projects = [project("p2")];
    rerender();

    expect(result.current.positions).toBeUndefined();
  });

  it("ST8: a late Requirements response for the old Project set is discarded after switching", async () => {
    let resolveOld!: (value: Map<string, MaterialRequirement[]>) => void;
    vi.mocked(listMaterialRequirementsForProjects)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(new Map());

    const { result, rerender } = renderHook(() => useSupplyPositions());
    await waitFor(() => expect(listMaterialRequirementsForProjects).toHaveBeenCalledTimes(1));

    projectsState.projects = [project("p2")];
    rerender();
    resolveOld(new Map([["p1", [requirement("stale", "p1", "mat-1")]]]));

    await waitFor(() => expect(result.current.positions).toEqual([]));
  });
});
