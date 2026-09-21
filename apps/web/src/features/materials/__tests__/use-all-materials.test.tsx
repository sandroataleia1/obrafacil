import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../materials-client", () => ({
  listAllMaterialsFromApi: vi.fn(),
}));

import { listAllMaterialsFromApi } from "../materials-client";
import { useAllMaterials } from "../use-all-materials";
import type { MaterialListItem } from "../types";

function item(id: string, name: string): MaterialListItem {
  return {
    id,
    name,
    unit_code: "un",
    unit_custom_label: null,
    active: true,
    updated_at: "2026-09-10T00:00:00Z",
  };
}

/**
 * SUPPLY-FRONTEND-01A §78, MF5-MF7. Mirrors
 * `features/projects/__tests__/use-all-projects.test.tsx` exactly — same
 * tenant-safety discipline, same race proofs.
 */
describe("useAllMaterials — SUPPLY-FRONTEND-01A §13-15 (MF5-MF7)", () => {
  beforeEach(() => {
    vi.mocked(listAllMaterialsFromApi).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("MF5: the render immediately after switching to Company B never returns Company A's materials", async () => {
    vi.mocked(listAllMaterialsFromApi).mockResolvedValueOnce([item("m1", "Cimento A")]).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(() => useAllMaterials());
    await waitFor(() => expect(result.current.materials).toEqual([item("m1", "Cimento A")]));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();

    expect(result.current.materials).toBeUndefined();
    expect(result.current.error).toBe(false);
  });

  it("MF6: a late success for Company A resolving after switching to B is discarded", async () => {
    let resolveA!: (value: MaterialListItem[]) => void;
    vi.mocked(listAllMaterialsFromApi)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockResolvedValueOnce([item("m2", "Areia B")]);

    const { result, rerender } = renderHook(() => useAllMaterials());
    await waitFor(() => expect(listAllMaterialsFromApi).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveA([item("m1", "Cimento A (stale)")]);

    await waitFor(() => expect(result.current.materials).toEqual([item("m2", "Areia B")]));
    expect(result.current.materials).not.toContainEqual(item("m1", "Cimento A (stale)"));
  });

  it("MF7: a late error for Company A never marks Company B as errored", async () => {
    let rejectA!: (error: Error) => void;
    vi.mocked(listAllMaterialsFromApi)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectA = reject; }))
      .mockResolvedValueOnce([item("m2", "Areia B")]);

    const { result, rerender } = renderHook(() => useAllMaterials());
    await waitFor(() => expect(listAllMaterialsFromApi).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    rejectA(new Error("network"));

    await waitFor(() => expect(result.current.materials).toEqual([item("m2", "Areia B")]));
    expect(result.current.error).toBe(false);
  });

  it("a real fetch failure returns error: true, never materials: []", async () => {
    vi.mocked(listAllMaterialsFromApi).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useAllMaterials());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.materials).toBeUndefined();
  });

  it("a genuinely empty Company returns [], not an error", async () => {
    vi.mocked(listAllMaterialsFromApi).mockResolvedValue([]);
    const { result } = renderHook(() => useAllMaterials());

    await waitFor(() => expect(result.current.materials).toEqual([]));
    expect(result.current.error).toBe(false);
  });

  it("reload() started under Company A is discarded if it resolves after switching to B", async () => {
    let resolveReload!: (value: MaterialListItem[]) => void;
    vi.mocked(listAllMaterialsFromApi)
      .mockResolvedValueOnce([item("m1", "Cimento A")])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveReload = resolve; }))
      .mockResolvedValueOnce([item("m2", "Areia B")]);

    const { result, rerender } = renderHook(() => useAllMaterials());
    await waitFor(() => expect(result.current.materials).toEqual([item("m1", "Cimento A")]));

    act(() => result.current.reload());
    await waitFor(() => expect(listAllMaterialsFromApi).toHaveBeenCalledTimes(2));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveReload([item("m1", "Cimento A (stale reload)")]);

    await waitFor(() => expect(result.current.materials).toEqual([item("m2", "Areia B")]));
  });
});
