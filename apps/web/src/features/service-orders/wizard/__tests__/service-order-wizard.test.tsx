import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/features/customers/customers-client", () => ({
  listCustomers: vi.fn(),
  getCustomer: vi.fn(),
  createCustomer: vi.fn(),
  lookupCnpj: vi.fn(),
  createAddress: vi.fn(),
  createContact: vi.fn(),
  lookupCep: vi.fn(),
}));

vi.mock("@/features/catalog/catalog-client", () => ({
  listCatalogItems: vi.fn(),
  createCatalogItem: vi.fn(),
}));

vi.mock("../../service-orders-client", () => ({
  getServiceOrderSettings: vi.fn(),
  createServiceOrder: vi.fn(),
}));

import { createCustomer, getCustomer } from "@/features/customers/customers-client";
import type { Customer } from "@/features/customers/types";
import { createServiceOrder, getServiceOrderSettings } from "../../service-orders-client";
import { ApiValidationError } from "@/lib/api-client";
import { ServiceOrderWizard } from "../service-order-wizard";

function customerDetail(overrides: Partial<Customer> = {}): Customer {
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
        id: "addr-1",
        label: "Endereço principal",
        type: "residential",
        postal_code: null,
        street: null,
        number: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
        reference_point: null,
        is_primary: true,
        created_at: "2026-09-10T00:00:00Z",
        updated_at: "2026-09-10T00:00:00Z",
      },
    ],
    contacts: [],
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

/** Reaches step 2 with a customer selected via the quick-create shortcut
 * (avoids the search debounce entirely — the tenant-safety behaviors
 * under test don't depend on the search path). */
async function selectCustomerAndAdvance(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(createCustomer).mockResolvedValue({ id: "cust-1", name: "Cliente Teste" } as never);
  await user.click(screen.getByRole("button", { name: /novo cliente/i }));
  await user.type(screen.getByLabelText("Nome"), "Cliente Teste");
  await user.click(screen.getByRole("button", { name: /criar cliente/i }));
  await waitFor(() => expect(screen.getByText("Cliente Teste")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Avançar" }));
}

describe("ServiceOrderWizard", () => {
  beforeEach(() => {
    vi.mocked(getServiceOrderSettings).mockResolvedValue({ default_travel_fee: "0.00" });
    vi.mocked(createCustomer).mockReset();
    vi.mocked(getCustomer).mockReset();
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    vi.mocked(createServiceOrder).mockReset();
    push.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("W1: starts on step 1 (Cliente)", () => {
    render(<ServiceOrderWizard />);
    expect(screen.getAllByText(/etapa 1 de 4/i)[0]).toBeInTheDocument();
  });

  it("W2: quick-creating a customer selects it and enables advancing to step 2", async () => {
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);

    expect(screen.getAllByText(/etapa 2 de 4/i)[0]).toBeInTheDocument();
  });

  it("W3: entering step 2 fetches full customer detail and auto-selects the primary address", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);

    await waitFor(() => expect(getCustomer).toHaveBeenCalledWith("cust-1"));
    await screen.findAllByText("Endereço principal");
    const radio = screen.getByRole("radio", { name: /endereço principal/i });
    expect(radio).toBeChecked();
  });

  it("W4: cannot advance from step 2 without an address selected", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail({ addresses: [] }));
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);

    await screen.findByText(/ainda não possui endereço/i);
    expect(screen.getByRole("button", { name: "Avançar" })).toBeDisabled();
  });

  it("W5: advancing from step 3 with zero items asks for confirmation before proceeding", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    expect(screen.getAllByText(/etapa 3 de 4/i)[0]).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Avançar" }));

    await screen.findByText("Continuar sem produtos ou serviços?");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getAllByText(/etapa 4 de 4/i)[0]).toBeInTheDocument());
  });

  it("W6: reaching step 4 with zero items auto-prefills the title from the customer name", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await screen.findByText("Continuar sem produtos ou serviços?");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByLabelText("Título")).toHaveValue("Atendimento - Cliente Teste"));
  });

  it("W7: submitting posts the exact payload shape and navigates to the created O.S.", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    vi.mocked(createServiceOrder).mockResolvedValue({ id: "os-1", number: "OS-000001" } as never);
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await screen.findByText("Continuar sem produtos ou serviços?");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await user.click(screen.getByRole("button", { name: /criar o\.s\./i }));

    await waitFor(() => expect(createServiceOrder).toHaveBeenCalled());
    const payload = vi.mocked(createServiceOrder).mock.calls[0]![0];
    expect(payload.customer_id).toBe("cust-1");
    expect(payload.customer_address_id).toBe("addr-1");
    expect(payload.responsible_user_id).toBeNull();
    expect(payload.items).toEqual([]);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ordens-servico/os-1"));
  });

  it("W8: a 422 on customer_address_id routes the user back to step 2", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    vi.mocked(createServiceOrder).mockRejectedValue(
      new ApiValidationError({ customer_address_id: ["O endereço selecionado é inválido."] })
    );
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await screen.findByText("Continuar sem produtos ou serviços?");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: /criar o\.s\./i }));

    await waitFor(() => expect(screen.getAllByText(/etapa 2 de 4/i)[0]).toBeInTheDocument());
    expect(screen.getByText("O endereço selecionado é inválido.")).toBeInTheDocument();
  });

  it("W9: switching the active company mid-wizard resets everything back to step 1", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    const user = userEvent.setup();
    const { rerender } = render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderWizard />);

    await waitFor(() => expect(screen.getAllByText(/etapa 1 de 4/i)[0]).toBeInTheDocument());
    expect(screen.queryByText("Cliente Teste")).not.toBeInTheDocument();
  });

  it("W10: a quick-create response that arrives after a tenant switch is discarded, never applied to the new tenant's wizard", async () => {
    let resolveCreate!: (value: unknown) => void;
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(createCustomer).mockReturnValue(createPromise as never);

    const user = userEvent.setup();
    const { rerender } = render(<ServiceOrderWizard />);
    await user.click(screen.getByRole("button", { name: /novo cliente/i }));
    await user.type(screen.getByLabelText("Nome"), "Cliente Antigo");
    await user.click(screen.getByRole("button", { name: /criar cliente/i }));

    // Tenant switches while the create request is still in flight.
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderWizard />);
    await waitFor(() => expect(screen.getAllByText(/etapa 1 de 4/i)[0]).toBeInTheDocument());

    resolveCreate({ id: "cust-old", name: "Cliente Antigo" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Cliente Antigo")).not.toBeInTheDocument();
  });

  it("W11: the travel fee is prefilled from GET /service-orders/settings on mount", async () => {
    vi.mocked(getServiceOrderSettings).mockResolvedValue({ default_travel_fee: "35.00" });
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await screen.findByText("Continuar sem produtos ou serviços?");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByLabelText("Deslocamento")).toHaveValue("35,00"));
  });

  it("W12: an end time before the start time blocks submission with an inline error", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await screen.findByText("Continuar sem produtos ou serviços?");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const startInput = await screen.findByLabelText(/início previsto/i);
    const endInput = screen.getByLabelText(/fim previsto/i);
    await user.type(startInput, "2026-10-01T14:00");
    await user.type(endInput, "2026-10-01T10:00");
    await user.click(screen.getByRole("button", { name: /criar o\.s\./i }));

    await screen.findByText(/o fim previsto deve ser igual ou posterior/i);
    expect(createServiceOrder).not.toHaveBeenCalled();
  });

  it("W13: the stepper never allows jumping ahead of the furthest reached step", async () => {
    render(<ServiceOrderWizard />);
    const step3Button = screen.getByRole("button", { name: /3.*produtos e serviços/i });
    expect(step3Button).toBeDisabled();
  });

  it("W14: the submit button is disabled while the request is in flight (no double-submit)", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    let resolveSubmit!: (value: unknown) => void;
    vi.mocked(createServiceOrder).mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }) as never
    );
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await screen.findByText("Continuar sem produtos ou serviços?");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await user.click(screen.getByRole("button", { name: /criar o\.s\./i }));

    expect(screen.getByRole("button", { name: /criando/i })).toBeDisabled();
    resolveSubmit({ id: "os-1", number: "OS-000001" });
  });

  it("W15: a company switch that lands after the create response arrives shows a controlled notice instead of navigating", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    let resolveSubmit!: (value: unknown) => void;
    vi.mocked(createServiceOrder).mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }) as never
    );
    const user = userEvent.setup();
    const { rerender } = render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await screen.findByText("Continuar sem produtos ou serviços?");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: /criar o\.s\./i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderWizard />);
    resolveSubmit({ id: "os-1", number: "OS-000001" });

    await screen.findByText(/a empresa ativa mudou durante o salvamento/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("W16: never renders any Obra/Projeto field anywhere in the wizard", async () => {
    vi.mocked(getCustomer).mockResolvedValue(customerDetail());
    const user = userEvent.setup();
    render(<ServiceOrderWizard />);
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");
    expect(screen.queryByText(/vincular projeto/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/obra/i)).not.toBeInTheDocument();
  });
});
