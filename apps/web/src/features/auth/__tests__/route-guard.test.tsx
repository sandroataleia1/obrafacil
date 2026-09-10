import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "../auth-provider";
import type { MePayload } from "../types";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("../auth-client", () => ({
  fetchMe: vi.fn(),
}));

import { fetchMe } from "../auth-client";

const SINGLE_COMPANY_PAYLOAD: MePayload = {
  user: { id: "u1", name: "Jefferson Vieira", email: "jefferson@example.com", phone: null },
  memberships: [{ company: { id: "c1", name: "JVW Construções" }, role: "owner" }],
  active_company: { id: "c1", name: "JVW Construções" },
  requires_company_selection: false,
};

const REQUIRES_SELECTION_PAYLOAD: MePayload = {
  user: { id: "u1", name: "Jefferson Vieira", email: "jefferson@example.com", phone: null },
  memberships: [
    { company: { id: "c1", name: "JVW Construções" }, role: "owner" },
    { company: { id: "c2", name: "Outra Empresa" }, role: "member" },
  ],
  active_company: null,
  requires_company_selection: true,
};

describe("AppShell route guard", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(fetchMe).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** F12: a protected route without an authenticated session redirects to /login. */
  it("redirects to /login when there is no session", async () => {
    vi.mocked(fetchMe).mockRejectedValue(new ApiError(401, "Unauthenticated."));

    render(
      <AuthProvider>
        <AppShell>
          <div data-testid="private-content">Private</div>
        </AppShell>
      </AuthProvider>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByTestId("private-content")).not.toBeInTheDocument();
  });

  /** F15: requires_company_selection directs to /selecionar-empresa instead of rendering the app. */
  it("redirects to /selecionar-empresa when the session requires a company selection", async () => {
    vi.mocked(fetchMe).mockResolvedValue(REQUIRES_SELECTION_PAYLOAD);

    render(
      <AuthProvider>
        <AppShell>
          <div data-testid="private-content">Private</div>
        </AppShell>
      </AuthProvider>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/selecionar-empresa"));
    expect(screen.queryByTestId("private-content")).not.toBeInTheDocument();
  });

  it("renders the app content when authenticated with an active company", async () => {
    vi.mocked(fetchMe).mockResolvedValue(SINGLE_COMPANY_PAYLOAD);

    render(
      <AuthProvider>
        <AppShell>
          <div data-testid="private-content">Private</div>
        </AppShell>
      </AuthProvider>
    );

    expect(await screen.findByTestId("private-content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
