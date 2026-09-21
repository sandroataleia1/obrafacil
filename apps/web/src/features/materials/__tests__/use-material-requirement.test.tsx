import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../material-requirements-client", () => ({
  getMaterialRequirement: vi.fn(),
}));

import { getMaterialRequirement } from "../material-requirements-client";
import { useMaterialRequirement } from "../use-material-requirement";
import type { MaterialRequirement } from "../types";

function requirement(id: string): MaterialRequirement {
  return {
    id,
    project_id: "project-a",
    material: { id: "material-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: "1.000",
    notes: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

/**
 * SUPPLY-FRONTEND-01B §47 (RH8-RH9). 404 vs. network error must never
 * collapse into the same state (`catch => null` is forbidden).
 */
describe("useMaterialRequirement — SUPPLY-FRONTEND-01B §47 (RH8-RH9)", () => {
  beforeEach(() => {
    vi.mocked(getMaterialRequirement).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("RH8: a real 404 resolves requirement to null, error stays false", async () => {
    vi.mocked(getMaterialRequirement).mockRejectedValue(new ApiError(404, "Not Found"));
    const { result } = renderHook(() => useMaterialRequirement("project-a", "r1"));
    await waitFor(() => expect(result.current.requirement).toBeNull());
    expect(result.current.error).toBe(false);
  });

  it("RH9: a 500/network failure sets error:true, requirement stays undefined (never null)", async () => {
    vi.mocked(getMaterialRequirement).mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useMaterialRequirement("project-a", "r1"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.requirement).toBeUndefined();
  });

  it("a successful load resolves the real Requirement", async () => {
    vi.mocked(getMaterialRequirement).mockResolvedValue(requirement("r1"));
    const { result } = renderHook(() => useMaterialRequirement("project-a", "r1"));
    await waitFor(() => expect(result.current.requirement).toEqual(requirement("r1")));
  });

  it("a stale response for the old Company is discarded after switching", async () => {
    let resolveOld!: (value: MaterialRequirement) => void;
    vi.mocked(getMaterialRequirement)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(requirement("r2"));

    const { result, rerender } = renderHook(() => useMaterialRequirement("project-a", "r1"));
    await waitFor(() => expect(getMaterialRequirement).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveOld(requirement("r1"));

    expect(result.current.requirement).toBeUndefined();
  });
});
