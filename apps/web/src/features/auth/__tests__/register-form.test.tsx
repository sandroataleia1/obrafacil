import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiValidationError } from "@/lib/api-client";
import { AuthProvider } from "../auth-provider";
import { RegisterForm } from "../register-form";
import type { MePayload } from "../types";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/cadastro",
}));

vi.mock("../auth-client", () => ({
  fetchMe: vi.fn(),
  register: vi.fn(),
}));

import { fetchMe, register } from "../auth-client";

const ME_PAYLOAD: MePayload = {
  user: { id: "u1", name: "Jefferson Vieira", email: "jefferson@example.com", phone: "+5511999999999" },
  memberships: [{ company: { id: "c1", name: "JVW Construções" }, role: "owner" }],
  active_company: { id: "c1", name: "JVW Construções" },
  requires_company_selection: false,
};

async function fillValidForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Nome da empresa/), "JVW Construções");
  await user.type(screen.getByLabelText(/Seu nome/), "Jefferson Vieira");
  await user.type(screen.getByLabelText(/E-mail/), "jefferson@example.com");
  await user.type(screen.getByLabelText(/WhatsApp/), "11999999999");
  await user.type(screen.getByLabelText("Senha *"), "correct-password");
  await user.type(screen.getByLabelText(/Confirmar senha/), "correct-password");
  return user;
}

describe("RegisterForm", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(fetchMe).mockReset();
    vi.mocked(register).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** F9: a 201 response enters the app automatically, without a second login. */
  it("enters the app automatically on a successful register (201)", async () => {
    vi.mocked(fetchMe).mockRejectedValue(new ApiError(401, "Unauthenticated."));
    vi.mocked(register).mockResolvedValue(ME_PAYLOAD);

    render(
      <AuthProvider>
        <RegisterForm />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByLabelText(/Nome da empresa/)).toBeInTheDocument());

    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        company_name: "JVW Construções",
        name: "Jefferson Vieira",
        email: "jefferson@example.com",
        phone: "+5511999999999",
        password: "correct-password",
        password_confirmation: "correct-password",
      })
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  /** F10: a 422 response associates errors with their fields. */
  it("associates 422 validation errors with their fields", async () => {
    vi.mocked(fetchMe).mockRejectedValue(new ApiError(401, "Unauthenticated."));
    vi.mocked(register).mockRejectedValue(
      new ApiValidationError({
        email: ["The email has already been taken."],
        phone: ["The phone must be a valid E.164 number."],
      })
    );

    render(
      <AuthProvider>
        <RegisterForm />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByLabelText(/Nome da empresa/)).toBeInTheDocument());

    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    const emailError = await screen.findByText("The email has already been taken.");
    const phoneError = screen.getByText("The phone must be a valid E.164 number.");

    expect(emailError).toBeInTheDocument();
    expect(phoneError).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/WhatsApp/)).toHaveAttribute("aria-invalid", "true");
    expect(replace).not.toHaveBeenCalled();
  });

  /** F14: an already-authenticated user visiting /cadastro is redirected into the app. */
  it("redirects an already-authenticated user away from /cadastro", async () => {
    vi.mocked(fetchMe).mockResolvedValue(ME_PAYLOAD);

    render(
      <AuthProvider>
        <RegisterForm />
      </AuthProvider>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByLabelText(/Nome da empresa/)).not.toBeInTheDocument();
  });
});
