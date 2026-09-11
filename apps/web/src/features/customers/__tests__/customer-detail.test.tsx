import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiValidationError } from "@/lib/api-client";
import { CustomerDetail } from "../customer-detail";
import type { Customer } from "../types";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
);

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/budgets/prototype/budget-store", () => ({
  listAllBudgets: () => [],
}));

vi.mock("@/features/projects/prototype/project-store", () => ({
  listProjectsByCustomer: () => [],
}));

vi.mock("../customers-client", () => ({
  getCustomer: vi.fn(),
  updateAddress: vi.fn(),
  updateContact: vi.fn(),
  createAddress: vi.fn(),
  createContact: vi.fn(),
  deleteAddress: vi.fn(),
  deleteContact: vi.fn(),
  deleteCustomer: vi.fn(),
}));

import { deleteAddress, getCustomer, updateAddress, updateContact } from "../customers-client";

function customerWithTwoAddressesAndContacts(): Customer {
  return {
    id: "cust-1",
    kind: "individual",
    name: "Cliente Teste",
    legal_name: null,
    trade_name: null,
    document: null,
    phone: null,
    email: null,
    notes: null,
    active: true,
    addresses: [
      {
        id: "addr-primary",
        label: "Casa",
        type: "residential",
        postal_code: "30140110",
        street: "Rua X",
        number: "10",
        complement: null,
        neighborhood: "Centro",
        city: "Belo Horizonte",
        state: "MG",
        reference_point: null,
        is_primary: true,
        created_at: "2026-09-10T00:00:00Z",
        updated_at: "2026-09-10T00:00:00Z",
      },
      {
        id: "addr-second",
        label: "Depósito",
        type: "work_site",
        postal_code: null,
        street: null,
        number: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
        reference_point: null,
        is_primary: false,
        created_at: "2026-09-10T00:00:00Z",
        updated_at: "2026-09-10T00:00:00Z",
      },
    ],
    contacts: [
      {
        id: "contact-primary",
        name: "João",
        role: "Engenheiro civil",
        department: "Engenharia",
        phone: null,
        whatsapp: null,
        email: null,
        notes: "Prefere contato pela manhã",
        is_primary: true,
        active: true,
        created_at: "2026-09-10T00:00:00Z",
        updated_at: "2026-09-10T00:00:00Z",
      },
      {
        id: "contact-second",
        name: "Maria",
        role: "Contas a pagar",
        department: "Financeiro",
        phone: null,
        whatsapp: null,
        email: null,
        notes: null,
        is_primary: false,
        active: true,
        created_at: "2026-09-10T00:00:00Z",
        updated_at: "2026-09-10T00:00:00Z",
      },
    ],
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

describe("CustomerDetail", () => {
  beforeEach(() => {
    vi.mocked(getCustomer).mockReset();
    vi.mocked(updateAddress).mockReset();
    vi.mocked(updateContact).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** §13: the primary address/contact is marked with a visible "Principal" text badge, not only the Star icon. */
  it("marks the primary address and contact with a visible 'Principal' badge", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerWithTwoAddressesAndContacts());
    render(<CustomerDetail id="cust-1" />);

    await screen.findByText("Casa");
    const badges = screen.getAllByText("Principal");
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });

  /** §15: contact notes are shown when present, and never rendered as an empty block when absent. */
  it("shows contact notes when present and omits the block when absent", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerWithTwoAddressesAndContacts());
    render(<CustomerDetail id="cust-1" />);

    await screen.findByText("João");
    expect(screen.getByText("Observações: Prefere contato pela manhã")).toBeInTheDocument();
    expect(screen.queryByText(/^Observações:\s*$/)).not.toBeInTheDocument();
  });

  /** §18/D7: "Tornar principal" gives visible feedback on failure — never silently succeeds. */
  it("shows an error message when 'Tornar principal' fails for an address", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerWithTwoAddressesAndContacts());
    vi.mocked(updateAddress).mockRejectedValue(new Error("network"));

    const user = userEvent.setup();
    render(<CustomerDetail id="cust-1" />);
    await screen.findByText("Depósito");

    await user.click(screen.getAllByRole("button", { name: "Tornar principal" })[0]!);

    await waitFor(() =>
      expect(screen.getByText("Não foi possível tornar este endereço principal agora.")).toBeInTheDocument()
    );
  });

  /** Same feedback rule for contacts. */
  it("shows an error message when 'Tornar principal' fails for a contact", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerWithTwoAddressesAndContacts());
    vi.mocked(updateContact).mockRejectedValue(new Error("network"));

    const user = userEvent.setup();
    render(<CustomerDetail id="cust-1" />);
    await screen.findByText("Maria");

    await user.click(screen.getAllByRole("button", { name: "Tornar principal" })[1]!);

    await waitFor(() =>
      expect(screen.getByText("Não foi possível tornar este contato principal agora.")).toBeInTheDocument()
    );
  });

  /** TA1/TA2/TA3: switching activeCompany immediately invalidates the previous Customer and triggers a fresh GET. */
  it("TA1-TA3: switching activeCompany hides Company A's Customer and fetches again", async () => {
    vi.mocked(getCustomer)
      .mockResolvedValueOnce({ ...customerWithTwoAddressesAndContacts(), name: "Cliente da Empresa A" })
      .mockResolvedValueOnce({ ...customerWithTwoAddressesAndContacts(), name: "Cliente da Empresa B" });

    const { rerender } = render(<CustomerDetail id="cust-1" />);
    await screen.findByText("Cliente da Empresa A");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerDetail id="cust-1" />);

    // TA3: Company A's data must disappear immediately, before B resolves.
    expect(screen.queryByText("Cliente da Empresa A")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await screen.findByText("Cliente da Empresa B");
    expect(getCustomer).toHaveBeenCalledTimes(2);
  });

  /** TA4: a 404 in the new tenant shows "Cliente não encontrado". */
  it("TA4: a 404 after switching tenants shows Cliente não encontrado", async () => {
    vi.mocked(getCustomer)
      .mockResolvedValueOnce(customerWithTwoAddressesAndContacts())
      .mockRejectedValueOnce(new ApiError(404, "not found"));

    const { rerender } = render(<CustomerDetail id="cust-1" />);
    await screen.findByText("Cliente Teste");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerDetail id="cust-1" />);

    await screen.findByText("Cliente não encontrado");
  });

  /** TA5/TA8: a slow response from the old tenant never overwrites the newer tenant's already-applied result — proving no customer is cached across tenants without a company key. */
  it("TA5/TA8: a late response from the old tenant never reappears after the new tenant's data loaded", async () => {
    let resolveFirst!: (value: Customer) => void;
    const firstPromise = new Promise<Customer>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(getCustomer)
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce({ ...customerWithTwoAddressesAndContacts(), name: "Cliente da Empresa B" });

    const { rerender } = render(<CustomerDetail id="cust-1" />);
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerDetail id="cust-1" />);

    await screen.findByText("Cliente da Empresa B");

    resolveFirst({ ...customerWithTwoAddressesAndContacts(), name: "Cliente da Empresa A" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText("Cliente da Empresa B")).toBeInTheDocument();
    expect(screen.queryByText("Cliente da Empresa A")).not.toBeInTheDocument();
  });

  /** D8/§19: the backend's delete-primary rejection message reaches the confirm dialog verbatim. */
  it("D8: shows the backend's delete-primary rejection message in the confirm dialog", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerWithTwoAddressesAndContacts());
    vi.mocked(deleteAddress).mockRejectedValue(
      new ApiValidationError({ address: ["Defina outro endereço principal antes de excluir este endereço."] })
    );

    const user = userEvent.setup();
    render(<CustomerDetail id="cust-1" />);
    await screen.findByText("Casa");

    await user.click(screen.getByRole("button", { name: "Excluir endereço Casa" }));
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() =>
      expect(screen.getByText("Defina outro endereço principal antes de excluir este endereço.")).toBeInTheDocument()
    );
  });

  /** TF12: an open Address dialog pointed at Company A's data closes on tenant switch and is never actionable afterward. */
  it("TF12: an open address edit dialog for Company A closes and stops being actionable on tenant switch", async () => {
    vi.mocked(getCustomer)
      .mockResolvedValueOnce(customerWithTwoAddressesAndContacts())
      .mockResolvedValueOnce({ ...customerWithTwoAddressesAndContacts(), name: "Cliente da Empresa B" });

    const user = userEvent.setup();
    const { rerender } = render(<CustomerDetail id="cust-1" />);
    await screen.findByText("Casa");

    await user.click(screen.getByRole("button", { name: "Editar endereço Casa" }));
    await screen.findByText("Editar endereço");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerDetail id="cust-1" />);

    // The dialog must be gone immediately — not just visually, but so its
    // "Salvar" action can no longer be triggered against Company A's data.
    expect(screen.queryByText("Editar endereço")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();

    await screen.findByText("Cliente da Empresa B");
  });

  /** TF12: same guarantee for the delete-address confirmation. */
  it("TF12: a pending delete-address confirmation for Company A is dropped on tenant switch", async () => {
    vi.mocked(getCustomer)
      .mockResolvedValueOnce(customerWithTwoAddressesAndContacts())
      .mockResolvedValueOnce({ ...customerWithTwoAddressesAndContacts(), name: "Cliente da Empresa B" });

    const user = userEvent.setup();
    const { rerender } = render(<CustomerDetail id="cust-1" />);
    await screen.findByText("Casa");

    await user.click(screen.getByRole("button", { name: "Excluir endereço Casa" }));
    await screen.findByText('Excluir o endereço "Casa"?');

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerDetail id="cust-1" />);

    expect(screen.queryByText('Excluir o endereço "Casa"?')).not.toBeInTheDocument();
    await screen.findByText("Cliente da Empresa B");
  });

  // ---------------------------------------------------------------
  // FRONTEND-CLIENTS-01C — error hardening (CD1-CD6)
  // ---------------------------------------------------------------

  /** CD1/CD2: a 500/network error shows the error state, not an infinite skeleton, with a retry button. */
  it("CD1/CD2: a network/500 error shows 'Não foi possível carregar este cliente agora.' with Tentar novamente, never an infinite skeleton", async () => {
    vi.mocked(getCustomer).mockRejectedValue(new Error("network"));
    render(<CustomerDetail id="cust-1" />);

    await screen.findByText("Não foi possível carregar este cliente agora.");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  /** CD3: clicking "Tentar novamente" re-fetches and, on success, shows the detail — no browser reload required. */
  it("CD3: retry after an error goes back to loading then renders on success", async () => {
    vi.mocked(getCustomer)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(customerWithTwoAddressesAndContacts());

    const user = userEvent.setup();
    render(<CustomerDetail id="cust-1" />);
    await screen.findByText("Não foi possível carregar este cliente agora.");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText("Cliente Teste");
    expect(getCustomer).toHaveBeenCalledTimes(2);
  });

  /** CD4: a 404 still shows "Cliente não encontrado" (unaffected by the error-state fix). */
  it("CD4: a 404 still shows Cliente não encontrado", async () => {
    vi.mocked(getCustomer).mockRejectedValue(new ApiError(404, "not found"));
    render(<CustomerDetail id="missing" />);

    await screen.findByText("Cliente não encontrado");
  });

  /** CD5: switching company A→B keeps showing the loading skeleton (fail-closed) until B's request settles. */
  it("CD5: switching companies shows the loading skeleton while B's request is pending, never A's stale error/data", async () => {
    let resolveB!: (value: Customer) => void;
    const bPromise = new Promise<Customer>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(getCustomer)
      .mockResolvedValueOnce({ ...customerWithTwoAddressesAndContacts(), name: "Cliente da Empresa A" })
      .mockReturnValueOnce(bPromise);

    const { rerender } = render(<CustomerDetail id="cust-1" />);
    await screen.findByText("Cliente da Empresa A");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerDetail id="cust-1" />);

    expect(screen.queryByText("Cliente da Empresa A")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar este cliente agora.")).not.toBeInTheDocument();

    resolveB({ ...customerWithTwoAddressesAndContacts(), name: "Cliente da Empresa B" });
    await screen.findByText("Cliente da Empresa B");
  });

  /** CD6: a late error from the old tenant (A) never replaces B's already-applied success. */
  it("CD6: a late error response from Company A is discarded after Company B already succeeded", async () => {
    let rejectA!: (error: Error) => void;
    const aPromise = new Promise<Customer>((_resolve, reject) => {
      rejectA = reject;
    });
    vi.mocked(getCustomer)
      .mockReturnValueOnce(aPromise)
      .mockResolvedValueOnce({ ...customerWithTwoAddressesAndContacts(), name: "Cliente da Empresa B" });

    const { rerender } = render(<CustomerDetail id="cust-1" />);
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerDetail id="cust-1" />);

    await screen.findByText("Cliente da Empresa B");

    rejectA(new Error("network"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText("Cliente da Empresa B")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar este cliente agora.")).not.toBeInTheDocument();
  });
});
