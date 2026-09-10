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
});
