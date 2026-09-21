import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../suppliers-client", () => ({
  listAllSuppliersFromApi: vi.fn(),
}));

import { listAllSuppliersFromApi } from "../suppliers-client";
import { useAllSuppliers } from "../use-all-suppliers";
import type { SupplierListItem } from "../types";

function item(id: string, name: string): SupplierListItem {
  return {
    id,
    name,
    document: null,
    contact_name: null,
    phone: null,
    active: true,
    updated_at: "2026-09-10T00:00:00Z",
  };
}

/**
 * SUPPLY-FRONTEND-01A §79, SF5-SF7. Mirrors
 * `features/materials/__tests__/use-all-materials.test.tsx`/
 * `features/projects/__tests__/use-all-projects.test.tsx` exactly.
 */
describe("useAllSuppliers — SUPPLY-FRONTEND-01A §17 (SF5-SF7)", () => {
  beforeEach(() => {
    vi.mocked(listAllSuppliersFromApi).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("SF5: the render immediately after switching to Company B never returns Company A's suppliers", async () => {
    vi.mocked(listAllSuppliersFromApi).mockResolvedValueOnce([item("s1", "Fornecedor A")]).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(() => useAllSuppliers());
    await waitFor(() => expect(result.current.suppliers).toEqual([item("s1", "Fornecedor A")]));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();

    expect(result.current.suppliers).toBeUndefined();
    expect(result.current.error).toBe(false);
  });

  it("SF6: a late success for Company A resolving after switching to B is discarded", async () => {
    let resolveA!: (value: SupplierListItem[]) => void;
    vi.mocked(listAllSuppliersFromApi)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockResolvedValueOnce([item("s2", "Fornecedor B")]);

    const { result, rerender } = renderHook(() => useAllSuppliers());
    await waitFor(() => expect(listAllSuppliersFromApi).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveA([item("s1", "Fornecedor A (stale)")]);

    await waitFor(() => expect(result.current.suppliers).toEqual([item("s2", "Fornecedor B")]));
    expect(result.current.suppliers).not.toContainEqual(item("s1", "Fornecedor A (stale)"));
  });

  it("a real fetch failure returns error: true, never suppliers: []", async () => {
    vi.mocked(listAllSuppliersFromApi).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useAllSuppliers());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.suppliers).toBeUndefined();
  });

  it("reload() started under Company A is discarded if it resolves after switching to B", async () => {
    let resolveReload!: (value: SupplierListItem[]) => void;
    vi.mocked(listAllSuppliersFromApi)
      .mockResolvedValueOnce([item("s1", "Fornecedor A")])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveReload = resolve; }))
      .mockResolvedValueOnce([item("s2", "Fornecedor B")]);

    const { result, rerender } = renderHook(() => useAllSuppliers());
    await waitFor(() => expect(result.current.suppliers).toEqual([item("s1", "Fornecedor A")]));

    act(() => result.current.reload());
    await waitFor(() => expect(listAllSuppliersFromApi).toHaveBeenCalledTimes(2));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveReload([item("s1", "Fornecedor A (stale reload)")]);

    await waitFor(() => expect(result.current.suppliers).toEqual([item("s2", "Fornecedor B")]));
  });
});
