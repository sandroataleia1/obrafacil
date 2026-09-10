import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { AuthProvider } from "../auth-provider";
import { LoginForm } from "../login-form";
import type { MePayload } from "../types";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/login",
}));

vi.mock("../auth-client", () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
}));

import { fetchMe, login } from "../auth-client";

const ME_PAYLOAD: MePayload = {
  user: { id: "u1", name: "Jefferson Vieira", email: "jefferson@example.com", phone: null },
  memberships: [{ company: { id: "c1", name: "JVW Construções" }, role: "owner" }],
  active_company: { id: "c1", name: "JVW Construções" },
  requires_company_selection: false,
};

describe("LoginForm", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(fetchMe).mockReset();
    vi.mocked(login).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** F7: a valid login updates the session state. */
  it("updates the auth session on a valid login", async () => {
    vi.mocked(fetchMe).mockRejectedValue(new ApiError(401, "Unauthenticated."));
    vi.mocked(login).mockResolvedValue(ME_PAYLOAD);

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginForm />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByLabelText("E-mail")).toBeInTheDocument());

    await user.type(screen.getByLabelText("E-mail"), "jefferson@example.com");
    await user.type(screen.getByLabelText("Senha"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("jefferson@example.com", "correct-password"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  /** F8: an invalid login shows a generic error message. */
  it("shows a generic error message on invalid credentials", async () => {
    vi.mocked(fetchMe).mockRejectedValue(new ApiError(401, "Unauthenticated."));
    vi.mocked(login).mockRejectedValue(new ApiError(422, "These credentials do not match our records."));

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginForm />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByLabelText("E-mail")).toBeInTheDocument());

    await user.type(screen.getByLabelText("E-mail"), "jefferson@example.com");
    await user.type(screen.getByLabelText("Senha"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("E-mail ou senha inválidos.");
    // The raw backend message (which would reveal credential-matching
    // internals) must never reach the DOM.
    expect(screen.queryByText(/does not match our records/i)).not.toBeInTheDocument();
  });

  /** F13: an already-authenticated user visiting /login is redirected into the app. */
  it("redirects an already-authenticated user away from /login", async () => {
    vi.mocked(fetchMe).mockResolvedValue(ME_PAYLOAD);

    render(
      <AuthProvider>
        <LoginForm />
      </AuthProvider>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    // Never a flash of the form while a valid session was found.
    expect(screen.queryByLabelText("E-mail")).not.toBeInTheDocument();
  });
});
