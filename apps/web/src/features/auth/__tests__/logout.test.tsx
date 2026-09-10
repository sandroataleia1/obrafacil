import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "../auth-provider";
import { usePerformLogout } from "../logout-button";
import type { MePayload } from "../types";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("../auth-client", () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
}));

import { fetchMe, logout } from "../auth-client";

const ME_PAYLOAD: MePayload = {
  user: { id: "u1", name: "Jefferson Vieira", email: "jefferson@example.com", phone: null },
  memberships: [{ company: { id: "c1", name: "JVW Construções" }, role: "owner" }],
  active_company: { id: "c1", name: "JVW Construções" },
  requires_company_selection: false,
};

function StatusProbe() {
  const auth = useAuth();
  return <span data-testid="status">{auth.status}</span>;
}

describe("logout", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(fetchMe).mockReset();
    vi.mocked(logout).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** F11: logout clears the React session state and redirects to /login. */
  it("clears the session and redirects to /login on success", async () => {
    vi.mocked(fetchMe).mockResolvedValue(ME_PAYLOAD);
    vi.mocked(logout).mockResolvedValue(undefined);

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    render(<StatusProbe />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    const { result } = renderHook(() => usePerformLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });

    expect(logout).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  /** Even if the backend call fails (session already expired), the UX still ends up signed out at /login. */
  it("still signs out locally and redirects even if the backend call fails", async () => {
    vi.mocked(fetchMe).mockResolvedValue(ME_PAYLOAD);
    vi.mocked(logout).mockRejectedValue(new Error("network error"));

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => usePerformLogout(), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(replace).toHaveBeenCalledWith("/login");
  });
});
