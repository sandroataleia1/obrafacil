import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../projects-client", () => ({
  getProject: vi.fn(),
}));

import { ApiError } from "@/lib/api-client";
import { getProject } from "../projects-client";
import { useProject } from "../use-project";
import type { Project } from "../types";

function project(id: string, name: string): Project {
  return {
    id,
    number: `OBR-${id}`,
    name,
    status: "planning",
    reference: null,
    customer: { id: "cust-1", name: "Cliente" },
    customer_address_id: null,
    address: null,
    expected_start_date: null,
    expected_end_date: null,
    source_budget: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

describe("useProject — FRONTEND-PROJECTS-01A §10-11 (TH7-TH10)", () => {
  beforeEach(() => {
    vi.mocked(getProject).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads Project A normally", async () => {
    vi.mocked(getProject).mockResolvedValue(project("a1", "Obra A1"));
    const { result } = renderHook(() => useProject("a1"));

    await waitFor(() => expect(result.current.project).toEqual(project("a1", "Obra A1")));
    expect(result.current.error).toBe(false);
  });

  /** TH7/§5: same-render fail-closed for a Company switch. */
  it("TH7: the render immediately after switching to Company B never returns Project A", async () => {
    vi.mocked(getProject).mockResolvedValueOnce(project("a1", "Obra A1")).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(() => useProject("a1"));
    await waitFor(() => expect(result.current.project).toEqual(project("a1", "Obra A1")));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();

    expect(result.current.project).toBeUndefined();
  });

  /** TH8: a late success for the OLD Company/id resolving after switching to B/id2 is discarded. */
  it("TH8: a late success for Company A resolving in the exact tick after switching to B is discarded", async () => {
    let resolveA!: (value: Project) => void;
    vi.mocked(getProject)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          })
      )
      .mockResolvedValueOnce(project("b1", "Obra B1"));

    const { result, rerender } = renderHook(({ id }) => useProject(id), { initialProps: { id: "a1" } });
    await waitFor(() => expect(getProject).toHaveBeenCalledWith("a1"));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender({ id: "b1" });
    resolveA(project("a1", "Obra A1 (stale)"));

    await waitFor(() => expect(result.current.project).toEqual(project("b1", "Obra B1")));
  });

  /** TH8b: same exact-race discipline also applies to a SAME-company id change (obra A -> obra B, same tenant). */
  it("TH8b: a late success for the old id resolving after an id-only switch (same Company) is discarded", async () => {
    let resolveA!: (value: Project) => void;
    vi.mocked(getProject)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          })
      )
      .mockResolvedValueOnce(project("a2", "Obra A2"));

    const { result, rerender } = renderHook(({ id }) => useProject(id), { initialProps: { id: "a1" } });
    await waitFor(() => expect(getProject).toHaveBeenCalledWith("a1"));

    rerender({ id: "a2" });
    resolveA(project("a1", "Obra A1 (stale)"));

    await waitFor(() => expect(result.current.project).toEqual(project("a2", "Obra A2")));
  });

  /** TH9/§11: a 404 is distinct from a real error — project: null, error: false. */
  it("TH9: a 404 sets project: null and error: false, never confused with a real fetch error", async () => {
    vi.mocked(getProject).mockRejectedValue(new ApiError(404, "Not found"));
    const { result } = renderHook(() => useProject("missing"));

    await waitFor(() => expect(result.current.project).toBeNull());
    expect(result.current.error).toBe(false);
  });

  /** TH10/§11: a network/500 failure sets error: true, and project stays undefined (never null, never a fake not-found). */
  it("TH10: a network/500 failure sets error: true and leaves project undefined, distinct from a 404", async () => {
    vi.mocked(getProject).mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useProject("a1"));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.project).toBeUndefined();
  });

  it("reload() re-fetches and belongs only to the tenant/id active when it was called", async () => {
    let resolveReload!: (value: Project) => void;
    vi.mocked(getProject)
      .mockResolvedValueOnce(project("a1", "Obra A1"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReload = resolve;
          })
      )
      .mockResolvedValueOnce(project("a1", "Obra A1 sob B"));

    const { result, rerender } = renderHook(() => useProject("a1"));
    await waitFor(() => expect(result.current.project).toEqual(project("a1", "Obra A1")));

    act(() => result.current.reload());
    await waitFor(() => expect(getProject).toHaveBeenCalledTimes(2));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveReload(project("a1", "Obra A1 (stale reload)"));

    await waitFor(() => expect(result.current.project).toEqual(project("a1", "Obra A1 sob B")));
  });
});
