import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api-client";
import {
  createMaterialRequirement,
  deleteMaterialRequirement,
  getMaterialRequirement,
  listAllMaterialRequirements,
  listMaterialRequirements,
  updateMaterialRequirement,
} from "../material-requirements-client";
import type { MaterialRequirement, MaterialRequirementPaginationResponse } from "../types";

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

function requirement(id: string): MaterialRequirement {
  return {
    id,
    project_id: "project-1",
    material: { id: "material-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: "1.000",
    notes: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

function page(data: MaterialRequirement[], currentPage: number, lastPage: number): MaterialRequirementPaginationResponse {
  return {
    data,
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 100, to: data.length, total: data.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/**
 * SUPPLY-FRONTEND-01B §46 (RC1-RC8). Client contract tests — never
 * testing `apiRequest` internals, only that this module calls it with
 * the right nested URL/method/params, and that `listAllMaterialRequirements`
 * pages past 100.
 */
describe("material-requirements-client — SUPPLY-FRONTEND-01B §46 (RC1-RC8)", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("RC1: list hits the nested /projects/{project}/material-requirements URL", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(page([], 1, 1));
    await listMaterialRequirements("project-1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/projects/project-1/material-requirements");
  });

  it("RC2: list sends page/per_page as query params", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(page([], 2, 3));
    await listMaterialRequirements("project-1", { page: 2, perPage: 50 });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/projects/project-1/material-requirements?page=2&per_page=50");
  });

  it("RC3: listAllMaterialRequirements pages past 100 (last_page=2) and returns all rows", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(page([requirement("r1")], 1, 2))
      .mockResolvedValueOnce(page([requirement("r2")], 2, 2));

    const all = await listAllMaterialRequirements("project-1");

    expect(all).toEqual([requirement("r1"), requirement("r2")]);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/v1/projects/project-1/material-requirements?page=1&per_page=100");
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/v1/projects/project-1/material-requirements?page=2&per_page=100");
  });

  it("RC4: getMaterialRequirement hits the nested detail URL", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(requirement("r1"));
    await getMaterialRequirement("project-1", "r1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/projects/project-1/material-requirements/r1");
  });

  it("RC5: create POSTs material_id/required_quantity/notes only", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(requirement("r1"));
    const payload = { material_id: "material-1", required_quantity: "1.000", notes: null };
    await createMaterialRequirement("project-1", payload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/projects/project-1/material-requirements", {
      method: "POST",
      body: payload,
    });
  });

  it("RC6: update PUTs required_quantity/notes only, never material_id", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(requirement("r1"));
    const payload = { required_quantity: "2.000", notes: "atualizado" };
    await updateMaterialRequirement("project-1", "r1", payload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/projects/project-1/material-requirements/r1", {
      method: "PUT",
      body: payload,
    });
    expect(Object.keys(payload)).not.toContain("material_id");
  });

  it("RC7: delete DELETEs the nested detail URL", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);
    await deleteMaterialRequirement("project-1", "r1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/projects/project-1/material-requirements/r1", { method: "DELETE" });
  });

  it("RC8: every client function goes through apiRequest, zero raw fetch calls made", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.mocked(apiRequest).mockResolvedValue(page([], 1, 1));
    await listMaterialRequirements("project-1");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
