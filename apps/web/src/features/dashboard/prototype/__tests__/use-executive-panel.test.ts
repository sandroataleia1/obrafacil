import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/projects/projects-client", () => ({
  listAllProjectsFromApi: vi.fn(),
}));

vi.mock("@/features/stock/stock-client", () => ({
  listAllStockPositions: vi.fn(),
}));

import { listAllProjectsFromApi } from "@/features/projects/projects-client";
import { listAllStockPositions } from "@/features/stock/stock-client";
import { useExecutivePanel } from "../use-executive-panel";
import type { ProjectListItem } from "@/features/projects/types";
import type { StockPosition } from "@/features/stock/types";

function projectItem(id: string, overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id,
    number: `OBR-00000${id}`,
    name: `Obra ${id}`,
    status: "in_progress",
    reference: null,
    customer: { id: "cust-1", name: "Cliente" },
    expected_start_date: null,
    expected_end_date: null,
    source_budget: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function position(id: string, projectId: string): StockPosition {
  return {
    project: { id: projectId, number: `OBR-00000${projectId}`, name: `Obra ${projectId}` },
    material: { id: `mat-${id}`, name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: "1.000",
    purchased_quantity: "0.000",
    received_quantity: "0.000",
    consumed_quantity: "0.000",
    stock_quantity: "0.000",
    pending_receipt_quantity: "0.000",
    missing_to_purchase_quantity: "1.000",
    total_in: "0.000",
    total_out: "0.000",
  };
}

describe("useExecutivePanel — FRONTEND-PROJECTS-01A §14 (TD9)", () => {
  beforeEach(() => {
    vi.mocked(listAllProjectsFromApi).mockReset();
    vi.mocked(listAllStockPositions).mockReset().mockResolvedValue([]);
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads normally for Company A", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([]);
    const { result } = renderHook(() => useExecutivePanel("2026-09"));

    await waitFor(() => expect(result.current.data).not.toBeUndefined());
    expect(result.current.error).toBe(false);
  });

  /** TD9: same-render fail-closed and exact-race discard as the other Project-API-backed hooks in this round. */
  it("TD9: a late resolution for Company A resolving in the exact tick after switching to B never writes Company B's data", async () => {
    let resolveA!: (value: never[]) => void;
    vi.mocked(listAllProjectsFromApi)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          })
      )
      .mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(() => useExecutivePanel("2026-09"));
    await waitFor(() => expect(listAllProjectsFromApi).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();

    // Same-render fail-closed: A's already-resolved data (if any) must not
    // still be visible once B is active.
    expect(result.current.data).toBeUndefined();

    resolveA([]);
    await waitFor(() => expect(result.current.data).not.toBeUndefined());
    expect(listAllProjectsFromApi).toHaveBeenCalledTimes(2);
  });

  /** TD9/§8: a real fetch failure surfaces as error: true, never a fabricated empty panel. */
  it("TD9b: a 500/network failure surfaces as error: true, never a fabricated empty panel", async () => {
    vi.mocked(listAllProjectsFromApi).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useExecutivePanel("2026-09"));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

/**
 * SUPPLY-FRONTEND-01D §37-44/§71. Supply planning per Project now comes
 * from real `StockPosition` (`listAllStockPositions()`, fetched ONCE for
 * the whole Company, never fanned out per Project) — never the removed
 * local Requirement/Purchase fan-out.
 */
describe("useExecutivePanel Stock migration — SUPPLY-FRONTEND-01D §71", () => {
  beforeEach(() => {
    vi.mocked(listAllProjectsFromApi).mockReset();
    vi.mocked(listAllStockPositions).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches StockPosition exactly once for the whole Company, never per Project", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([projectItem("1"), projectItem("2")]);
    vi.mocked(listAllStockPositions).mockResolvedValue([position("r1", "1"), position("r2", "2")]);

    const { result } = renderHook(() => useExecutivePanel("2026-09"));
    await waitFor(() => expect(result.current.data).not.toBeUndefined());

    expect(listAllStockPositions).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(false);
  });

  it("groups positions by project.id so each Project entry only sees its own materials", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([projectItem("1"), projectItem("2")]);
    vi.mocked(listAllStockPositions).mockResolvedValue([position("r1", "1")]);

    const { result } = renderHook(() => useExecutivePanel("2026-09"));
    await waitFor(() => expect(result.current.data).not.toBeUndefined());

    const entry1 = result.current.data!.projectEntries.find((entry) => entry.project.id === "1")!;
    const entry2 = result.current.data!.projectEntries.find((entry) => entry.project.id === "2")!;
    expect(entry1.facts.materials.pendingToBuyCount).toBe(1);
    expect(entry2.facts.materials.pendingToBuyCount).toBe(0);
  });

  it("a StockPosition-API failure for the Company puts the panel in error:true, never a fabricated empty result", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([projectItem("1")]);
    vi.mocked(listAllStockPositions).mockRejectedValue(new Error("500"));

    const { result } = renderHook(() => useExecutivePanel("2026-09"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("a late StockPosition response for Company A resolving after switching to B is discarded", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([projectItem("1")]);
    let resolveA!: (value: StockPosition[]) => void;
    vi.mocked(listAllStockPositions)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(() => useExecutivePanel("2026-09"));
    await waitFor(() => expect(listAllStockPositions).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveA([position("stale", "1")]);

    await waitFor(() => expect(result.current.data).not.toBeUndefined());
    expect(listAllStockPositions).toHaveBeenCalledTimes(2);
  });
});
