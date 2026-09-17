import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/features/customers/customers-client", () => ({
  getCustomer: vi.fn(),
  listCustomers: vi.fn(),
  lookupCep: vi.fn(),
}));

vi.mock("../projects-client", () => ({
  getProject: vi.fn(),
  updateProject: vi.fn(),
}));

import { getCustomer, listCustomers } from "@/features/customers/customers-client";
import type { Customer } from "@/features/customers/types";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { getProject, updateProject } from "../projects-client";
import { ProjectEditForm } from "../project-edit-form";
import type { Project } from "../types";

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

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
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
    created_at: "2026-09-01T00:00:00.000000Z",
    updated_at: "2026-09-01T00:00:00.000000Z",
    ...overrides,
  };
}

const emptyCustomerPage = {
  data: [],
  meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 },
  links: { first: null, last: null, prev: null, next: null },
};

describe("ProjectEditForm", () => {
  beforeEach(() => {
    vi.mocked(getProject).mockReset();
    vi.mocked(updateProject).mockReset();
    vi.mocked(getCustomer).mockReset().mockResolvedValue(customer());
    vi.mocked(listCustomers).mockReset().mockResolvedValue(emptyCustomerPage);
    push.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("PE1: hydrates name/reference/dates from a real GET", async () => {
    vi.mocked(getProject).mockResolvedValue(
      project({ reference: "Casa da praia", expected_start_date: "2026-10-01", expected_end_date: "2026-12-31" })
    );
    render(<ProjectEditForm id="proj-1" />);

    const nameInput = await screen.findByLabelText<HTMLInputElement>(/nome da obra/i);
    expect(nameInput.value).toBe("Casa Oliveira");
    expect(screen.getByLabelText<HTMLInputElement>(/referência/i).value).toBe("Casa da praia");
    expect(screen.getByLabelText<HTMLInputElement>(/data prevista de início/i).value).toBe("2026-10-01");
    expect(screen.getByLabelText<HTMLInputElement>(/data prevista de conclusão/i).value).toBe("2026-12-31");
  });

  it("PE2: with a source_budget, the Customer field is read-only", async () => {
    vi.mocked(getProject).mockResolvedValue(
      project({ source_budget: { id: "budget-1", number: "ORC-000001", total: "1500.00" } })
    );
    render(<ProjectEditForm id="proj-1" />);

    await screen.findByText(/permanece vinculada ao mesmo cliente/i);
    expect(screen.getByText("João da Silva")).toBeInTheDocument();
    expect(screen.queryByLabelText(/buscar cliente/i)).not.toBeInTheDocument();
  });

  it("PE3: without a source_budget, the Customer is editable via the picker", async () => {
    vi.mocked(getProject).mockResolvedValue(project());
    render(<ProjectEditForm id="proj-1" />);

    await screen.findByLabelText(/nome da obra/i);
    expect(screen.getByLabelText(/buscar cliente/i)).toBeInTheDocument();
  });

  it("PE4: hydrates a structured address into the address fields", async () => {
    vi.mocked(getProject).mockResolvedValue(
      project({
        customer_address_id: null,
        address: {
          postal_code: "01310100",
          street: "Av. Paulista",
          number: "1000",
          complement: null,
          neighborhood: "Bela Vista",
          city: "São Paulo",
          state: "SP",
          reference_point: null,
        },
      })
    );
    render(<ProjectEditForm id="proj-1" />);

    const streetInput = await screen.findByLabelText<HTMLInputElement>(/logradouro/i);
    expect(streetInput.value).toBe("Av. Paulista");
    await waitFor(() => expect(screen.getByRole("radio", { name: /endereço manual/i })).toBeChecked());
  });

  it("PE5: changing the Customer falls the address source back to manual when the old customer_address_id no longer applies, preserving the fields", async () => {
    vi.mocked(getProject).mockResolvedValue(
      project({
        customer_address_id: "addr-1",
        address: { postal_code: null, street: "Rua Antiga", number: null, complement: null, neighborhood: null, city: null, state: null, reference_point: null },
      })
    );
    vi.mocked(getCustomer).mockResolvedValue(
      customer({
        addresses: [
          {
            id: "addr-1",
            label: "Casa",
            type: "residential",
            postal_code: null,
            street: "Rua Antiga",
            number: null,
            complement: null,
            neighborhood: null,
            city: null,
            state: null,
            reference_point: null,
            is_primary: false,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      })
    );
    render(<ProjectEditForm id="proj-1" />);
    await screen.findByLabelText(/nome da obra/i);
    await waitFor(() => expect(screen.getByRole("radio", { name: /^Casa/ })).toBeChecked());
    await screen.findByRole("button", { name: /trocar cliente/i });

    vi.mocked(listCustomers).mockResolvedValue({
      ...emptyCustomerPage,
      data: [{ ...customer({ id: "cust-2", name: "Maria Souza", addresses: [] }), primary_address: null, primary_contact: null }],
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /trocar cliente/i }));
    await user.type(screen.getByLabelText(/buscar cliente/i), "Maria");
    await screen.findByText("Maria Souza");
    await user.click(screen.getByText("Maria Souza"));

    await waitFor(() => expect(screen.getByRole("radio", { name: /endereço manual/i })).toBeChecked());
    expect(screen.getByLabelText<HTMLInputElement>(/logradouro/i).value).toBe("Rua Antiga");
  });

  it("PE9: PUT carries updated_at and never sends source_budget_id", async () => {
    vi.mocked(getProject).mockResolvedValue(project());
    vi.mocked(updateProject).mockResolvedValue(project({ name: "Casa Reformada" }));
    const user = userEvent.setup();
    render(<ProjectEditForm id="proj-1" />);
    await screen.findByLabelText(/nome da obra/i);

    await user.clear(screen.getByLabelText(/nome da obra/i));
    await user.type(screen.getByLabelText(/nome da obra/i), "Casa Reformada");
    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    const [id, payload] = vi.mocked(updateProject).mock.calls[0]!;
    expect(id).toBe("proj-1");
    expect(payload.updated_at).toBe("2026-09-01T00:00:00.000000Z");
    expect(payload).not.toHaveProperty("source_budget_id");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/obras/proj-1"));
  });

  it("PE9b: a source-Project's PUT still never includes source_budget_id", async () => {
    vi.mocked(getProject).mockResolvedValue(
      project({ source_budget: { id: "budget-1", number: "ORC-000001", total: "1500.00" } })
    );
    vi.mocked(updateProject).mockResolvedValue(project({ source_budget: { id: "budget-1", number: "ORC-000001", total: "1500.00" } }));
    const user = userEvent.setup();
    render(<ProjectEditForm id="proj-1" />);
    await screen.findByLabelText(/nome da obra/i);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    const [, payload] = vi.mocked(updateProject).mock.calls[0]!;
    expect(payload).not.toHaveProperty("source_budget_id");
  });

  it("PE10: a 422 on name maps to the name field", async () => {
    vi.mocked(getProject).mockResolvedValue(project());
    vi.mocked(updateProject).mockRejectedValue(new ApiValidationError({ name: ["O campo nome é obrigatório."] }));
    const user = userEvent.setup();
    render(<ProjectEditForm id="proj-1" />);
    await screen.findByLabelText(/nome da obra/i);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await screen.findByText("O campo nome é obrigatório.");
  });

  it("PE11/PE12: a 409 preserves the draft (no auto-retry) and shows a 'Recarregar dados' action", async () => {
    vi.mocked(getProject)
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project({ name: "Nome atualizado no servidor" }));
    vi.mocked(updateProject).mockRejectedValue(new ApiError(409, "Conflict"));
    const user = userEvent.setup();
    render(<ProjectEditForm id="proj-1" />);
    await screen.findByLabelText(/nome da obra/i);

    await user.clear(screen.getByLabelText(/nome da obra/i));
    await user.type(screen.getByLabelText(/nome da obra/i), "Rascunho do usuário");
    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await screen.findByText(/A obra foi alterada por outra pessoa/);
    expect(updateProject).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText<HTMLInputElement>(/nome da obra/i).value).toBe("Rascunho do usuário");

    await user.click(screen.getByRole("button", { name: /recarregar dados/i }));
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>(/nome da obra/i).value).toBe("Nome atualizado no servidor"));
  });

  it("PE13: a stale-tenant PUT response never navigates", async () => {
    vi.mocked(getProject).mockResolvedValue(project());
    let resolveUpdate!: (value: Project) => void;
    vi.mocked(updateProject).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );
    const user = userEvent.setup();
    const { rerender } = render(<ProjectEditForm id="proj-1" />);
    await screen.findByLabelText(/nome da obra/i);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));
    await waitFor(() => expect(updateProject).toHaveBeenCalled());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ProjectEditForm id="proj-1" />);
    resolveUpdate(project({ name: "Casa Reformada" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(push).not.toHaveBeenCalled();
  });

  it("PE14: a 404 shows a not-found state", async () => {
    vi.mocked(getProject).mockRejectedValue(new ApiError(404, "Not found"));
    render(<ProjectEditForm id="missing" />);
    await screen.findByText("Obra não encontrada");
  });
});
