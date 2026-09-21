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

vi.mock("@/features/materials/material-requirements-client", () => ({
  listMaterialRequirementsForProjects: vi.fn(),
}));

import { listAllProjectsFromApi } from "@/features/projects/projects-client";
import { listMaterialRequirementsForProjects } from "@/features/materials/material-requirements-client";
import { useExecutivePanel } from "../use-executive-panel";
import type { ProjectListItem } from "@/features/projects/types";
import type { MaterialRequirement } from "@/features/materials/types";

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

function requirement(id: string, projectId: string): MaterialRequirement {
  return {
    id,
    project_id: projectId,
    material: { id: `mat-${id}`, name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: "1.000",
    notes: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

describe("useExecutivePanel — FRONTEND-PROJECTS-01A §14 (TD9)", () => {
  beforeEach(() => {
    vi.mocked(listAllProjectsFromApi).mockReset();
    vi.mocked(listMaterialRequirementsForProjects).mockReset().mockResolvedValue(new Map());
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
 * SUPPLY-FRONTEND-01B1 §8-10/§28 (EP1-EP6). Requirements per Project now
 * come from the real API via `listMaterialRequirementsForProjects` —
 * never the removed local store.
 */
describe("useExecutivePanel Requirement migration — SUPPLY-FRONTEND-01B1 §28 (EP1-EP6)", () => {
  beforeEach(() => {
    vi.mocked(listAllProjectsFromApi).mockReset();
    vi.mocked(listMaterialRequirementsForProjects).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("EP1/EP2: two Projects each receive their own real Requirements", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([projectItem("1"), projectItem("2")]);
    vi.mocked(listMaterialRequirementsForProjects).mockResolvedValue(
      new Map([
        ["1", [requirement("r1", "1")]],
        ["2", [requirement("r2", "2")]],
      ])
    );

    const { result } = renderHook(() => useExecutivePanel("2026-09"));
    await waitFor(() => expect(result.current.data).not.toBeUndefined());

    expect(listMaterialRequirementsForProjects).toHaveBeenCalledWith(["1", "2"]);
    expect(result.current.error).toBe(false);
  });

  it("EP3: a Requirements-API failure for any Project puts the panel in error:true, never a fabricated empty result for that Project", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([projectItem("1")]);
    vi.mocked(listMaterialRequirementsForProjects).mockRejectedValue(new Error("500"));

    const { result } = renderHook(() => useExecutivePanel("2026-09"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("EP4: a late Requirements response for Company A resolving after switching to B is discarded", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([projectItem("1")]);
    let resolveA!: (value: Map<string, MaterialRequirement[]>) => void;
    vi.mocked(listMaterialRequirementsForProjects)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockResolvedValueOnce(new Map());

    const { result, rerender } = renderHook(() => useExecutivePanel("2026-09"));
    await waitFor(() => expect(listMaterialRequirementsForProjects).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveA(new Map([["1", [requirement("stale", "1")]]]));

    await waitFor(() => expect(result.current.data).not.toBeUndefined());
    expect(listMaterialRequirementsForProjects).toHaveBeenCalledTimes(2);
  });
});
