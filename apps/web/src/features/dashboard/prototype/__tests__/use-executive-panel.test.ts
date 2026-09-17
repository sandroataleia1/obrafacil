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

import { listAllProjectsFromApi } from "@/features/projects/projects-client";
import { useExecutivePanel } from "../use-executive-panel";

describe("useExecutivePanel — FRONTEND-PROJECTS-01A §14 (TD9)", () => {
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
