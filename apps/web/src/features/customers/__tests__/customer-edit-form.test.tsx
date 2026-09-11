import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { CustomerEditForm } from "../customer-edit-form";
import type { Customer } from "../types";

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

vi.mock("../customers-client", () => ({
  getCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  lookupCnpj: vi.fn(),
}));

import { getCustomer, lookupCnpj, updateCustomer } from "../customers-client";

function companyCustomer(overrides?: Partial<Customer>): Customer {
  return {
    id: "cust-1",
    kind: "company",
    name: "Alpha",
    legal_name: "Alpha Ltda",
    trade_name: "Alpha",
    document: "19131243000197",
    phone: null,
    email: null,
    notes: null,
    active: true,
    addresses: [],
    contacts: [],
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

describe("CustomerEditForm", () => {
  beforeEach(() => {
    vi.mocked(getCustomer).mockReset();
    vi.mocked(updateCustomer).mockReset();
    vi.mocked(lookupCnpj).mockReset();
    push.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** Phone roundtrip on edit: CNPJ lookup fills an empty phone from E.164
   * without corrupting it (same blocker class as the create form). */
  it("phone roundtrip: CNPJ lookup on edit displays and resubmits the exact E.164", async () => {
    vi.mocked(getCustomer).mockResolvedValue(companyCustomer({ phone: null }));
    vi.mocked(lookupCnpj).mockResolvedValue({
      document: "19131243000197",
      legal_name: "Alpha Ltda",
      trade_name: "Alpha",
      phone: "+551123851939",
      email: null,
      address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
    });

    const user = userEvent.setup();
    render(<CustomerEditForm customerId="cust-1" />);
    await screen.findByLabelText("Nome para identificação");

    await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));
    const phoneInput = await screen.findByLabelText(/^Telefone/);
    await waitFor(() => expect(phoneInput).toHaveValue("(11) 2385-1939"));

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
    const [, payload] = vi.mocked(updateCustomer).mock.calls[0]!;
    expect(payload.phone).toBe("+551123851939");
  });

  /** A phone already present on the loaded Customer is never overwritten by the lookup. */
  it("CNPJ lookup never overwrites an existing phone", async () => {
    vi.mocked(getCustomer).mockResolvedValue(companyCustomer({ phone: "+5531988887777" }));
    vi.mocked(lookupCnpj).mockResolvedValue({
      document: "19131243000197",
      legal_name: "Alpha Ltda",
      trade_name: "Alpha",
      phone: "+551123851939",
      email: null,
      address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
    });

    const user = userEvent.setup();
    render(<CustomerEditForm customerId="cust-1" />);
    const phoneInput = await screen.findByLabelText(/^Telefone/);
    expect(phoneInput).toHaveValue("(31) 98888-7777");

    await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));
    await waitFor(() => expect(lookupCnpj).toHaveBeenCalledTimes(1));
    expect(phoneInput).toHaveValue("(31) 98888-7777");
  });

  /** TA6: switching activeCompany re-fetches and never keeps company A's form visible. */
  it("TA6: switching activeCompany discards the previous tenant's form and refetches", async () => {
    vi.mocked(getCustomer)
      .mockResolvedValueOnce(companyCustomer({ id: "cust-1", name: "Cliente da Empresa A" }))
      .mockResolvedValueOnce(companyCustomer({ id: "cust-1", name: "Cliente da Empresa B" }));

    const { rerender } = render(<CustomerEditForm customerId="cust-1" />);
    await waitFor(() => expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Cliente da Empresa A"));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerEditForm customerId="cust-1" />);

    // Immediately invalidated — never shows A's data mid-switch.
    expect(screen.queryByLabelText("Nome para identificação")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Cliente da Empresa B"));
    expect(getCustomer).toHaveBeenCalledTimes(2);
  });

  /** TA4/TA6: if the Customer doesn't exist in the new tenant, show "Cliente não encontrado". */
  it("TA4: a 404 in the new tenant shows Cliente não encontrado, never a stale form", async () => {
    vi.mocked(getCustomer)
      .mockResolvedValueOnce(companyCustomer({ name: "Cliente da Empresa A" }))
      .mockRejectedValueOnce(new ApiError(404, "not found"));

    const { rerender } = render(<CustomerEditForm customerId="cust-1" />);
    await waitFor(() => expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Cliente da Empresa A"));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerEditForm customerId="cust-1" />);

    await waitFor(() => expect(screen.getByText("Cliente não encontrado")).toBeInTheDocument());
    expect(screen.queryByLabelText("Nome para identificação")).not.toBeInTheDocument();
  });

  /** TA5: a slow, stale response from the previous tenant must not reapply after a newer one already resolved. */
  it("TA5: a late-arriving response from the old tenant never overwrites the new tenant's data", async () => {
    let resolveFirst!: (value: Customer) => void;
    const firstPromise = new Promise<Customer>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(getCustomer)
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(companyCustomer({ name: "Cliente da Empresa B" }));

    const { rerender } = render(<CustomerEditForm customerId="cust-1" />);
    // Switch tenants before the first (slow) request resolves.
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerEditForm customerId="cust-1" />);

    await waitFor(() => expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Cliente da Empresa B"));

    // The stale Company A response now resolves late.
    resolveFirst(companyCustomer({ name: "Cliente da Empresa A" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Cliente da Empresa B");
  });

  // ---------------------------------------------------------------
  // FRONTEND-CLIENTS-01C — error hardening (CE1-CE6)
  // ---------------------------------------------------------------

  /** CE1/CE2: a 500/network error shows the error state (with a retry button), never an infinite skeleton. */
  it("CE1/CE2: a network/500 error shows 'Não foi possível carregar este cliente agora.' with Tentar novamente, never an infinite skeleton", async () => {
    vi.mocked(getCustomer).mockRejectedValue(new Error("network"));
    render(<CustomerEditForm customerId="cust-1" />);

    await screen.findByText("Não foi possível carregar este cliente agora.");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nome para identificação")).not.toBeInTheDocument();
  });

  /** CE3: retry re-fetches and, on success, the form renders pre-filled — no browser reload required. */
  it("CE3: retry after an error goes back to loading then renders the pre-filled form on success", async () => {
    vi.mocked(getCustomer)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(companyCustomer({ name: "Alpha reloaded" }));

    const user = userEvent.setup();
    render(<CustomerEditForm customerId="cust-1" />);
    await screen.findByText("Não foi possível carregar este cliente agora.");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Alpha reloaded"));
    expect(getCustomer).toHaveBeenCalledTimes(2);
  });

  /** CE4: a 404 still shows "Cliente não encontrado" (unaffected by the error-state fix). */
  it("CE4: a 404 still shows Cliente não encontrado, never a stale/infinite skeleton", async () => {
    vi.mocked(getCustomer).mockRejectedValue(new ApiError(404, "not found"));
    render(<CustomerEditForm customerId="missing" />);

    await screen.findByText("Cliente não encontrado");
  });

  /** CE5: switching company A→B never leaves Company A's form editable while B's request is pending. */
  it("CE5: switching companies keeps the loading skeleton (never an editable A form) while B's request is pending", async () => {
    let resolveB!: (value: Customer) => void;
    const bPromise = new Promise<Customer>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(getCustomer)
      .mockResolvedValueOnce(companyCustomer({ name: "Cliente da Empresa A" }))
      .mockReturnValueOnce(bPromise);

    const { rerender } = render(<CustomerEditForm customerId="cust-1" />);
    await waitFor(() => expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Cliente da Empresa A"));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerEditForm customerId="cust-1" />);

    expect(screen.queryByLabelText("Nome para identificação")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar este cliente agora.")).not.toBeInTheDocument();

    resolveB(companyCustomer({ name: "Cliente da Empresa B" }));
    await waitFor(() => expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Cliente da Empresa B"));
  });

  /** CE6: a late error/response from the old tenant (A) is discarded after B already succeeded. */
  it("CE6: a late error response from Company A is discarded after Company B already succeeded", async () => {
    let rejectA!: (error: Error) => void;
    const aPromise = new Promise<Customer>((_resolve, reject) => {
      rejectA = reject;
    });
    vi.mocked(getCustomer)
      .mockReturnValueOnce(aPromise)
      .mockResolvedValueOnce(companyCustomer({ name: "Cliente da Empresa B" }));

    const { rerender } = render(<CustomerEditForm customerId="cust-1" />);
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerEditForm customerId="cust-1" />);

    await waitFor(() => expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Cliente da Empresa B"));

    rejectA(new Error("network"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Cliente da Empresa B");
    expect(screen.queryByText("Não foi possível carregar este cliente agora.")).not.toBeInTheDocument();
  });
});
