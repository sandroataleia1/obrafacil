import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const searchParamsState = { current: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParamsState.current,
}));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/customers/customers-client", () => ({
  getCustomer: vi.fn(),
  listCustomers: vi.fn(),
  lookupCep: vi.fn(),
}));

vi.mock("@/features/budgets/budgets-client", () => ({
  getBudget: vi.fn(),
}));

vi.mock("../projects-client", () => ({
  createProject: vi.fn(),
}));

import { getCustomer, listCustomers } from "@/features/customers/customers-client";
import type { Customer } from "@/features/customers/types";
import { getBudget } from "@/features/budgets/budgets-client";
import type { Budget } from "@/features/budgets/types";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { createProject } from "../projects-client";
import { ProjectCreateForm } from "../project-create-form";

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    kind: "individual",
    name: "João da Silva",
    legal_name: null,
    trade_name: null,
    document: null,
    phone: null,
    email: null,
    notes: null,
    active: true,
    addresses: [],
    contacts: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "budget-1",
    number: "ORC-000001",
    status: "approved",
    customer_id: "cust-1",
    title: "Reforma completa",
    reference: null,
    customer: { name: "João da Silva", document: null, phone: null, email: null },
    valid_until: null,
    payment_terms: null,
    execution_terms: null,
    proposal_terms: null,
    notes: null,
    sale_subtotal: "1500.00",
    cost_subtotal: null,
    margin_amount: null,
    margin_percentage: null,
    discount_amount: null,
    total: "1500.00",
    proposal_token: null,
    submitted_at: null,
    decision_source: null,
    decision_by_name: null,
    decision_note: null,
    decided_at: "2026-09-01T00:00:00Z",
    proposal_company: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  } as Budget;
}

const emptyCustomerPage = {
  data: [],
  meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 },
  links: { first: null, last: null, prev: null, next: null },
};

describe("ProjectCreateForm", () => {
  beforeEach(() => {
    vi.mocked(getCustomer).mockReset().mockResolvedValue(customer());
    vi.mocked(listCustomers).mockReset().mockResolvedValue(emptyCustomerPage);
    vi.mocked(getBudget).mockReset();
    vi.mocked(createProject).mockReset();
    push.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    searchParamsState.current = new URLSearchParams();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("PC1/PC2/PC3: a minimal manual Project sends only name+customer_id, status is never in the payload, and navigates with the server's response", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customer());
    vi.mocked(createProject).mockResolvedValue({
      id: "new-proj",
      number: "OBR-000001",
      name: "Casa Oliveira",
      status: "planning",
      reference: null,
      customer: { id: "cust-1", name: "João da Silva" },
      customer_address_id: null,
      address: null,
      expected_start_date: null,
      expected_end_date: null,
      source_budget: null,
      created_at: "2026-09-10T00:00:00Z",
      updated_at: "2026-09-10T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<ProjectCreateForm />);

    await user.type(screen.getByLabelText(/nome da obra/i), "Casa Oliveira");
    await user.type(screen.getByLabelText(/buscar cliente/i), "João");
    vi.mocked(listCustomers).mockResolvedValue({ ...emptyCustomerPage, data: [{ ...customer(), primary_address: null, primary_contact: null }] });
    await screen.findByText("João da Silva");
    await user.click(screen.getByText("João da Silva"));

    await user.click(screen.getByRole("button", { name: /criar obra/i }));

    await waitFor(() => expect(createProject).toHaveBeenCalled());
    const payload = vi.mocked(createProject).mock.calls[0]![0];
    expect(payload.name).toBe("Casa Oliveira");
    expect(payload.customer_id).toBe("cust-1");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("number");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/obras/new-proj"));
  });

  it("PC4: ?customerId= preselects a valid Customer via the API, never trusting the bare UUID", async () => {
    searchParamsState.current = new URLSearchParams({ customerId: "cust-1" });
    vi.mocked(getCustomer).mockResolvedValue(customer({ name: "Maria Souza" }));
    render(<ProjectCreateForm />);

    await waitFor(() => expect(getCustomer).toHaveBeenCalledWith("cust-1"));
    await screen.findByText("Maria Souza");
  });

  it("PC4b: an invalid ?customerId= shows controlled feedback and falls back to the picker", async () => {
    searchParamsState.current = new URLSearchParams({ customerId: "does-not-exist" });
    vi.mocked(getCustomer).mockRejectedValue(new ApiError(404, "Not found"));
    render(<ProjectCreateForm />);

    await screen.findByText(/não foi possível carregar o cliente informado/i);
    expect(screen.getByLabelText(/buscar cliente/i)).toBeInTheDocument();
  });

  it("PC12/PC13: a valid sourceBudgetId locks the Customer and shows the source card", async () => {
    searchParamsState.current = new URLSearchParams({ sourceBudgetId: "budget-1" });
    vi.mocked(getBudget).mockResolvedValue(budget());
    render(<ProjectCreateForm />);

    await screen.findByText("ORC-000001", { exact: false });
    expect(screen.getByText("R$ 1.500,00")).toBeInTheDocument();
    expect(screen.queryByLabelText(/buscar cliente/i)).not.toBeInTheDocument();
    expect(screen.getByText(/mesmo cliente do orçamento aprovado/i)).toBeInTheDocument();
  });

  it("PC14: prefills name from Budget.title and reference from Budget.reference", async () => {
    searchParamsState.current = new URLSearchParams({ sourceBudgetId: "budget-1" });
    vi.mocked(getBudget).mockResolvedValue(budget({ title: "Reforma completa", reference: "Casa da praia" }));
    render(<ProjectCreateForm />);

    const nameInput = await screen.findByLabelText<HTMLInputElement>(/nome da obra/i);
    await waitFor(() => expect(nameInput.value).toBe("Reforma completa"));
    const referenceInput = screen.getByLabelText<HTMLInputElement>(/referência/i);
    expect(referenceInput.value).toBe("Casa da praia");
  });

  it("PC15/BH2-BH4/§14: an unapproved or invalid source shows controlled feedback with a link to create without a source", async () => {
    searchParamsState.current = new URLSearchParams({ sourceBudgetId: "budget-1" });
    vi.mocked(getBudget).mockResolvedValue(budget({ status: "draft" }));
    render(<ProjectCreateForm />);

    await screen.findByText(/não está aprovado/i);
    const link = screen.getByRole("button", { name: /criar obra sem orçamento/i });
    expect(link).toHaveAttribute("href", "/obras/nova");
  });

  it("PC15b: a 404/cross-tenant source shows a distinct controlled message", async () => {
    searchParamsState.current = new URLSearchParams({ sourceBudgetId: "missing" });
    vi.mocked(getBudget).mockRejectedValue(new ApiError(404, "Not found"));
    render(<ProjectCreateForm />);

    await screen.findByText(/não foi possível carregar este orçamento/i);
  });

  it("BH7: the create payload includes source_budget_id when created from an approved Budget", async () => {
    searchParamsState.current = new URLSearchParams({ sourceBudgetId: "budget-1" });
    vi.mocked(getBudget).mockResolvedValue(budget());
    vi.mocked(createProject).mockResolvedValue({
      id: "new-proj",
      number: "OBR-000001",
      name: "Reforma completa",
      status: "planning",
      reference: null,
      customer: { id: "cust-1", name: "João da Silva" },
      customer_address_id: null,
      address: null,
      expected_start_date: null,
      expected_end_date: null,
      source_budget: { id: "budget-1", number: "ORC-000001", total: "1500.00" },
      created_at: "2026-09-10T00:00:00Z",
      updated_at: "2026-09-10T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<ProjectCreateForm />);
    await screen.findByText("ORC-000001", { exact: false });

    await user.click(screen.getByRole("button", { name: /criar obra/i }));

    await waitFor(() => expect(createProject).toHaveBeenCalled());
    const payload = vi.mocked(createProject).mock.calls[0]![0];
    expect(payload.source_budget_id).toBe("budget-1");
    expect(payload.customer_id).toBe("cust-1");
  });

  it("PC6: a manual address is sent verbatim, with customer_address_id null", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customer());
    vi.mocked(listCustomers).mockResolvedValue({ ...emptyCustomerPage, data: [{ ...customer(), primary_address: null, primary_contact: null }] });
    vi.mocked(createProject).mockResolvedValue({
      id: "new-proj",
      number: "OBR-000001",
      name: "Casa",
      status: "planning",
      reference: null,
      customer: { id: "cust-1", name: "João da Silva" },
      customer_address_id: null,
      address: null,
      expected_start_date: null,
      expected_end_date: null,
      source_budget: null,
      created_at: "2026-09-10T00:00:00Z",
      updated_at: "2026-09-10T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<ProjectCreateForm />);

    await user.type(screen.getByLabelText(/nome da obra/i), "Casa");
    await user.type(screen.getByLabelText(/buscar cliente/i), "João");
    await screen.findByText("João da Silva");
    await user.click(screen.getByText("João da Silva"));

    await screen.findByText("Sem endereço");
    await user.click(screen.getByRole("radio", { name: /endereço manual/i }));
    await user.type(screen.getByLabelText(/logradouro/i), "Rua das Flores");

    await user.click(screen.getByRole("button", { name: /criar obra/i }));

    await waitFor(() => expect(createProject).toHaveBeenCalled());
    const payload = vi.mocked(createProject).mock.calls[0]![0];
    expect(payload.customer_address_id).toBeNull();
    expect(payload.address).toEqual(
      expect.objectContaining({ street: "Rua das Flores" })
    );
  });

  it("PC9: 'Sem endereço' sends address: null and customer_address_id: null", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customer());
    vi.mocked(listCustomers).mockResolvedValue({ ...emptyCustomerPage, data: [{ ...customer(), primary_address: null, primary_contact: null }] });
    vi.mocked(createProject).mockResolvedValue({
      id: "new-proj",
      number: "OBR-000001",
      name: "Casa",
      status: "planning",
      reference: null,
      customer: { id: "cust-1", name: "João da Silva" },
      customer_address_id: null,
      address: null,
      expected_start_date: null,
      expected_end_date: null,
      source_budget: null,
      created_at: "2026-09-10T00:00:00Z",
      updated_at: "2026-09-10T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<ProjectCreateForm />);

    await user.type(screen.getByLabelText(/nome da obra/i), "Casa");
    await user.type(screen.getByLabelText(/buscar cliente/i), "João");
    await screen.findByText("João da Silva");
    await user.click(screen.getByText("João da Silva"));
    await screen.findByText("Sem endereço");

    await user.click(screen.getByRole("button", { name: /criar obra/i }));

    await waitFor(() => expect(createProject).toHaveBeenCalled());
    const payload = vi.mocked(createProject).mock.calls[0]![0];
    expect(payload.address).toBeNull();
    expect(payload.customer_address_id).toBeNull();
  });

  it("PC8: a 422 on name maps to the name field", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customer());
    vi.mocked(listCustomers).mockResolvedValue({ ...emptyCustomerPage, data: [{ ...customer(), primary_address: null, primary_contact: null }] });
    vi.mocked(createProject).mockRejectedValue(new ApiValidationError({ name: ["O campo nome é obrigatório."] }));
    const user = userEvent.setup();
    render(<ProjectCreateForm />);

    await user.type(screen.getByLabelText(/nome da obra/i), "Casa");
    await user.type(screen.getByLabelText(/buscar cliente/i), "João");
    await screen.findByText("João da Silva");
    await user.click(screen.getByText("João da Silva"));

    await user.click(screen.getByRole("button", { name: /criar obra/i }));

    await waitFor(() => expect(screen.getAllByText("O campo nome é obrigatório.").length).toBeGreaterThan(0));
  });

  it("PC16/TR5/TR6: a stale POST response for Company A is ignored after switching to Company B (never navigates)", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customer());
    vi.mocked(listCustomers).mockResolvedValue({ ...emptyCustomerPage, data: [{ ...customer(), primary_address: null, primary_contact: null }] });
    let resolveCreate!: (value: Awaited<ReturnType<typeof createProject>>) => void;
    vi.mocked(createProject).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );
    const user = userEvent.setup();
    const { rerender } = render(<ProjectCreateForm />);

    await user.type(screen.getByLabelText(/nome da obra/i), "Casa");
    await user.type(screen.getByLabelText(/buscar cliente/i), "João");
    await screen.findByText("João da Silva");
    await user.click(screen.getByText("João da Silva"));
    await user.click(screen.getByRole("button", { name: /criar obra/i }));

    await waitFor(() => expect(createProject).toHaveBeenCalled());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ProjectCreateForm />);
    resolveCreate({
      id: "new-proj",
      number: "OBR-000001",
      name: "Casa",
      status: "planning",
      reference: null,
      customer: { id: "cust-1", name: "João da Silva" },
      customer_address_id: null,
      address: null,
      expected_start_date: null,
      expected_end_date: null,
      source_budget: null,
      created_at: "2026-09-10T00:00:00Z",
      updated_at: "2026-09-10T00:00:00Z",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(push).not.toHaveBeenCalled();
  });
});
