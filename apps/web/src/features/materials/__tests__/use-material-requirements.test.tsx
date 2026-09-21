import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../material-requirements-client", () => ({
  listAllMaterialRequirements: vi.fn(),
}));

import { listAllMaterialRequirements } from "../material-requirements-client";
import { useMaterialRequirements } from "../use-material-requirements";
import type { MaterialRequirement } from "../types";

function requirement(id: string, name: string): MaterialRequirement {
  return {
    id,
    project_id: "project-a",
    material: { id: `mat-${id}`, name, unit_code: "un", unit_custom_label: null, active: true },
    required_quantity: "1.000",
    notes: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

/**
 * SUPPLY-FRONTEND-01B §47 (RH1-RH7, RH10). Tagged by BOTH companyId and
 * projectId — a Company switch AND a Project switch must each
 * independently fail closed.
 */
describe("useMaterialRequirements — SUPPLY-FRONTEND-01B §47 (RH1-RH7,RH10)", () => {
  beforeEach(() => {
    vi.mocked(listAllMaterialRequirements).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("RH1: same-tenant list resolves normally", async () => {
    vi.mocked(listAllMaterialRequirements).mockResolvedValue([requirement("r1", "Cimento")]);
    const { result } = renderHook(() => useMaterialRequirements("project-a"));
    await waitFor(() => expect(result.current.requirements).toEqual([requirement("r1", "Cimento")]));
    expect(result.current.error).toBe(false);
  });

  it("RH2: a real empty Obra returns [], not an error", async () => {
    vi.mocked(listAllMaterialRequirements).mockResolvedValue([]);
    const { result } = renderHook(() => useMaterialRequirements("project-a"));
    await waitFor(() => expect(result.current.requirements).toEqual([]));
    expect(result.current.error).toBe(false);
  });

  it("RH3: a network error returns error:true, never requirements:[]", async () => {
    vi.mocked(listAllMaterialRequirements).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useMaterialRequirements("project-a"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.requirements).toBeUndefined();
  });

  it("RH4/RH6: switching Company (same render) fails closed until the new response resolves", async () => {
    vi.mocked(listAllMaterialRequirements)
      .mockResolvedValueOnce([requirement("r1", "Cimento A")])
      .mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(() => useMaterialRequirements("project-a"));
    await waitFor(() => expect(result.current.requirements).toEqual([requirement("r1", "Cimento A")]));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();

    expect(result.current.requirements).toBeUndefined();
    expect(result.current.error).toBe(false);
  });

  it("RH5: a late Company-A response resolving after the switch to B is discarded", async () => {
    let resolveA!: (value: MaterialRequirement[]) => void;
    vi.mocked(listAllMaterialRequirements)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockResolvedValueOnce([requirement("r2", "Areia B")]);

    const { result, rerender } = renderHook(() => useMaterialRequirements("project-a"));
    await waitFor(() => expect(listAllMaterialRequirements).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveA([requirement("r1", "Cimento A (stale)")]);

    await waitFor(() => expect(result.current.requirements).toEqual([requirement("r2", "Areia B")]));
  });

  it("RH6: switching Project (same Company) fails closed until the new response resolves", async () => {
    vi.mocked(listAllMaterialRequirements)
      .mockResolvedValueOnce([requirement("r1", "Cimento A")])
      .mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ projectId }) => useMaterialRequirements(projectId), {
      initialProps: { projectId: "project-a" },
    });
    await waitFor(() => expect(result.current.requirements).toEqual([requirement("r1", "Cimento A")]));

    rerender({ projectId: "project-b" });

    expect(result.current.requirements).toBeUndefined();
  });

  it("RH7: a late old-Project response resolving after switching Project is discarded", async () => {
    let resolveOld!: (value: MaterialRequirement[]) => void;
    vi.mocked(listAllMaterialRequirements)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce([requirement("r2", "Projeto B")]);

    const { result, rerender } = renderHook(({ projectId }) => useMaterialRequirements(projectId), {
      initialProps: { projectId: "project-a" },
    });
    await waitFor(() => expect(listAllMaterialRequirements).toHaveBeenCalledTimes(1));

    rerender({ projectId: "project-b" });
    resolveOld([requirement("r1", "Projeto A (stale)")]);

    await waitFor(() => expect(result.current.requirements).toEqual([requirement("r2", "Projeto B")]));
  });

  it("RH10: reload() started before a switch is discarded if it resolves after", async () => {
    let resolveReload!: (value: MaterialRequirement[]) => void;
    vi.mocked(listAllMaterialRequirements)
      .mockResolvedValueOnce([requirement("r1", "Cimento A")])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveReload = resolve; }))
      .mockResolvedValueOnce([requirement("r2", "Areia B")]);

    const { result, rerender } = renderHook(() => useMaterialRequirements("project-a"));
    await waitFor(() => expect(result.current.requirements).toEqual([requirement("r1", "Cimento A")]));

    act(() => result.current.reload());
    await waitFor(() => expect(listAllMaterialRequirements).toHaveBeenCalledTimes(2));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveReload([requirement("r1", "Cimento A (stale reload)")]);

    await waitFor(() => expect(result.current.requirements).toEqual([requirement("r2", "Areia B")]));
  });
});
