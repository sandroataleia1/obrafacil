import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompanySelect } from "../company-select";
import { AuthProvider } from "../auth-provider";
import type { MePayload } from "../types";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/selecionar-empresa",
}));

vi.mock("../auth-client", () => ({
  fetchMe: vi.fn(),
  activateCompany: vi.fn(),
}));

import { activateCompany, fetchMe } from "../auth-client";

const REQUIRES_SELECTION_PAYLOAD: MePayload = {
  user: { id: "u1", name: "Jefferson Vieira", email: "jefferson@example.com", phone: null },
  memberships: [
    { company: { id: "c1", name: "JVW Construções" }, role: "owner" },
    { company: { id: "c2", name: "Outra Empresa" }, role: "member" },
  ],
  active_company: null,
  requires_company_selection: true,
};

const ACTIVATED_PAYLOAD: MePayload = {
  ...REQUIRES_SELECTION_PAYLOAD,
  active_company: { id: "c2", name: "Outra Empresa" },
  requires_company_selection: false,
};

describe("CompanySelect", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(fetchMe).mockReset();
    vi.mocked(activateCompany).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** F16: selecting a company activates it and updates the active company / redirects into the app. */
  it("activates the selected company and enters the app", async () => {
    vi.mocked(fetchMe).mockResolvedValue(REQUIRES_SELECTION_PAYLOAD);
    vi.mocked(activateCompany).mockResolvedValue(ACTIVATED_PAYLOAD);

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <CompanySelect />
      </AuthProvider>
    );

    const outraEmpresaButton = await screen.findByRole("button", { name: /Outra Empresa/ });
    await user.click(outraEmpresaButton);

    await waitFor(() => expect(activateCompany).toHaveBeenCalledWith("c2"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("only renders companies that came back on the session's own memberships list", async () => {
    vi.mocked(fetchMe).mockResolvedValue(REQUIRES_SELECTION_PAYLOAD);

    render(
      <AuthProvider>
        <CompanySelect />
      </AuthProvider>
    );

    expect(await screen.findByText("JVW Construções")).toBeInTheDocument();
    expect(screen.getByText("Outra Empresa")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
