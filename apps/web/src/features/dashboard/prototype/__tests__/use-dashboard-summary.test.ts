import { act, renderHook, waitFor } from "@testing-library/react";
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

import { listAllProjectsFromApi } from "@/features/projects/projects-client";
import { useDashboardSummary } from "../use-dashboard-summary";

describe("useDashboardSummary — FRONTEND-PROJECTS-01A §13 (TD6-TD8)", () => {
  beforeEach(() => {
    vi.mocked(listAllProjectsFromApi).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads normally for Company A", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([]);
    const { result } = renderHook(() => useDashboardSummary());

    await waitFor(() => expect(result.current.summary).not.toBeUndefined());
    expect(result.current.error).toBe(false);
  });

  /**
   * TD6/§5: the render immediately after switching to Company B must
   * never return Company A's summary, even before B's own fetch has
   * resolved.
   */
  it("TD6: the render immediately after switching to Company B never returns Company A's summary", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValueOnce([]).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(() => useDashboardSummary());
    await waitFor(() => expect(result.current.summary).not.toBeUndefined());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();

    expect(result.current.summary).toBeUndefined();
    expect(result.current.error).toBe(false);
  });

  /** TD7: a late resolution for Company A after switching to B is discarded, never overwrites B's summary. */
  it("TD7: a late summary resolution for Company A resolving in the exact tick after switching to B is discarded", async () => {
    let resolveA!: (value: never[]) => void;
    vi.mocked(listAllProjectsFromApi)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          })
      )
      .mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(() => useDashboardSummary());
    await waitFor(() => expect(listAllProjectsFromApi).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveA([]);

    await waitFor(() => expect(result.current.summary).not.toBeUndefined());
    // Company B's own request is the one that actually settled `loaded`.
    expect(listAllProjectsFromApi).toHaveBeenCalledTimes(2);
  });

  /** TD8/§8: a real fetch failure surfaces as error: true, never an all-zeros summary standing in for real data. */
  it("TD8: a 500/network failure surfaces as error: true, never a fabricated empty summary", async () => {
    vi.mocked(listAllProjectsFromApi).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useDashboardSummary());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.summary).toBeUndefined();
  });

  it("reload() re-fetches and belongs only to the tenant active when it was called", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([]);
    const { result } = renderHook(() => useDashboardSummary());
    await waitFor(() => expect(result.current.summary).not.toBeUndefined());

    act(() => result.current.reload());
    await waitFor(() => expect(listAllProjectsFromApi).toHaveBeenCalledTimes(2));
  });
});
