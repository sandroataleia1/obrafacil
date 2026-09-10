import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "../auth-provider";
import { usePerformLogout } from "../logout-button";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/",
}));

const ME_PAYLOAD_BODY = JSON.stringify({
  user: { id: "u1", name: "Jefferson Vieira", email: "jefferson@example.com", phone: null },
  memberships: [{ company: { id: "c1", name: "JVW Construções" }, role: "owner" }],
  active_company: { id: "c1", name: "JVW Construções" },
  requires_company_selection: false,
});

/**
 * Exercises the real auth-provider/auth-client/api-client chain (only
 * `fetch` is mocked) — these tests specifically verify the resilience
 * logic added in Gate FRONTEND-AUTH-01A, which lives in that real chain,
 * not in a mock.
 */
function LogoutHarness() {
  const auth = useAuth();
  const { performLogout, status, error } = usePerformLogout();

  return (
    <div>
      <span data-testid="auth-status">{auth.status}</span>
      <button type="button" onClick={() => void performLogout()}>
        Sair
      </button>
      <span data-testid="logout-status">{status}</span>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function mockFetchRouter(logoutHandler: () => Response) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
    if (url.includes("/api/v1/logout")) return Promise.resolve(logoutHandler());
    if (url.includes("/api/v1/me")) return Promise.resolve(new Response(ME_PAYLOAD_BODY, { status: 200 }));
    throw new Error(`Unexpected fetch call: ${url}`);
  });
}

describe("logout (Gate FRONTEND-AUTH-01A)", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * L1: a real 204 clears the session and redirects to /login.
   *
   * This replaces the previous (BACKEND-01-era) assertion that ANY error —
   * including a network failure — should also clear the session and
   * redirect. That behavior was wrong: the frontend has no way to confirm
   * the Laravel session/HttpOnly cookie was actually destroyed when the
   * request never completed successfully, so treating every failure as
   * "logged out" could show a user a login screen while their server-side
   * session (and cookie) were still fully valid. See L3/L4 below for the
   * corrected behavior on failure.
   */
  it("L1: a successful logout clears the session and redirects to /login", async () => {
    vi.stubGlobal("fetch", mockFetchRouter(() => new Response(null, { status: 204 })));

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LogoutHarness />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));

    await user.click(screen.getByRole("button", { name: "Sair" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated");
  });

  /** L3/L4/L5: a network error or 5xx never clears the session, never redirects, and shows a retryable message. */
  it.each([
    ["network error", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["500", () => Promise.resolve(new Response(JSON.stringify({ message: "boom" }), { status: 500 }))],
  ])("L3/L4/L5: a %s on logout keeps the session and shows a failure message", async (_label, logoutOutcome) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
        if (url.includes("/api/v1/logout")) return logoutOutcome();
        if (url.includes("/api/v1/me")) return Promise.resolve(new Response(ME_PAYLOAD_BODY, { status: 200 }));
        throw new Error(`Unexpected fetch call: ${url}`);
      })
    );

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LogoutHarness />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));

    await user.click(screen.getByRole("button", { name: "Sair" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível sair. Verifique sua conexão e tente novamente.");

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
  });

  /** L6: retrying (clicking "Sair" again) after a failure can still succeed. */
  it("L6: retrying after a failure succeeds and then clears the session", async () => {
    let logoutCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
        if (url.includes("/api/v1/logout")) {
          logoutCallCount += 1;
          if (logoutCallCount === 1) {
            return Promise.resolve(new Response(JSON.stringify({ message: "boom" }), { status: 500 }));
          }
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (url.includes("/api/v1/me")) return Promise.resolve(new Response(ME_PAYLOAD_BODY, { status: 200 }));
        throw new Error(`Unexpected fetch call: ${url}`);
      })
    );

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LogoutHarness />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));

    await user.click(screen.getByRole("button", { name: "Sair" }));
    await screen.findByRole("alert");
    expect(replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sair" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated");
  });
});
