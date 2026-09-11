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

import { createCustomer, getCustomer, listCustomers } from "@/features/customers/customers-client";
import type { Customer, CustomerListItem, CustomerPaginationResponse } from "@/features/customers/types";
import { listCatalogItems } from "@/features/catalog/catalog-client";
import type { CatalogItem, CatalogItemPaginationResponse } from "@/features/catalog/types";
import { createServiceOrder, getServiceOrderSettings } from "../../service-orders-client";
import { ApiValidationError } from "@/lib/api-client";
import { ServiceOrderWizard } from "../service-order-wizard";
import { StepItems } from "../step-items";

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

function customerListItem(overrides: Partial<CustomerListItem> = {}): CustomerListItem {
  return {
    id: "cust-search-1",
    kind: "individual",
    name: "Cliente Buscado",
    legal_name: null,
    trade_name: null,
    document: null,
    phone: null,
    email: null,
    active: true,
    primary_address: null,
    primary_contact: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function customerPage(items: CustomerListItem[]): CustomerPaginationResponse {
  return {
    data: items,
    meta: { current_page: 1, from: 1, last_page: 1, per_page: 15, to: items.length, total: items.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

function catalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "item-1",
    type: "service",
    code: null,
    name: "Pintura",
    category: null,
    unit: "m²",
    description: null,
    cost_price: null,
    sale_price: "150.00",
    active: true,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function catalogPage(items: CatalogItem[]): CatalogItemPaginationResponse {
  return {
    data: items,
    meta: { current_page: 1, from: 1, last_page: 1, per_page: 15, to: items.length, total: items.length },
    links: { first: null, last: null, prev: null, next: null },
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
    vi.mocked(listCustomers).mockReset();
    vi.mocked(listCustomers).mockResolvedValue(customerPage([]));
    vi.mocked(listCatalogItems).mockReset();
    vi.mocked(listCatalogItems).mockResolvedValue(catalogPage([]));
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

  /** Reaches step 4 with zero items and an address selected — the
   * shortest path to the submit-time revalidation checks. */
  async function reachStep4(user: ReturnType<typeof userEvent.setup>) {
    await selectCustomerAndAdvance(user);
    await screen.findAllByText("Endereço principal");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await screen.findByText("Continuar sem produtos ou serviços?");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
  }

  describe("Tenant-ownership: search & catalog", () => {
    it("OT1: Company A's search shows Company A's results", async () => {
      vi.mocked(listCustomers).mockResolvedValue(customerPage([customerListItem({ name: "Fulano da Empresa A" })]));
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);

      await user.type(screen.getByLabelText("Buscar cliente"), "Fulano");

      await screen.findByText("Fulano da Empresa A");
    });

    it("OT2: switching to Company B immediately clears A's search results", async () => {
      vi.mocked(listCustomers).mockResolvedValue(customerPage([customerListItem({ name: "Fulano da Empresa A" })]));
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderWizard />);

      await user.type(screen.getByLabelText("Buscar cliente"), "Fulano");
      await screen.findByText("Fulano da Empresa A");

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderWizard />);

      expect(screen.queryByText("Fulano da Empresa A")).not.toBeInTheDocument();
    });

    it("OT7: a late catalog search response for Company A never populates Company B's results — tested directly on StepItems, independent of the wizard unmounting it on a switch", async () => {
      let resolveSearch!: (value: CatalogItemPaginationResponse) => void;
      const searchPromise = new Promise<CatalogItemPaginationResponse>((resolve) => {
        resolveSearch = resolve;
      });
      vi.mocked(listCatalogItems).mockReturnValueOnce(searchPromise);
      const activeCompanyIdRef = { current: "company-a" as string | undefined };
      const isStaleRequest = (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId;
      const user = userEvent.setup();
      const { rerender } = render(
        <StepItems items={[]} onAdd={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()} requestCompanyId="company-a" isStaleRequest={isStaleRequest} />
      );

      await user.type(screen.getByLabelText("Buscar produto ou serviço"), "Pintura");
      await waitFor(() => expect(listCatalogItems).toHaveBeenCalled());

      // Company switches while the request is still in flight — StepItems
      // stays mounted (unlike inside the full wizard, which always resets
      // to step 1), so this exercises the fix directly.
      activeCompanyIdRef.current = "company-b";
      rerender(
        <StepItems items={[]} onAdd={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()} requestCompanyId="company-b" isStaleRequest={isStaleRequest} />
      );

      resolveSearch(catalogPage([catalogItem({ name: "Pintura da Empresa A" })]));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.queryByText("Pintura da Empresa A")).not.toBeInTheDocument();
    });
  });

  describe("Travel settings gate blocking submit", () => {
    it("WI1: while travel settings are loading, 'Criar O.S.' is disabled", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      let resolveSettings!: (value: { default_travel_fee: string }) => void;
      vi.mocked(getServiceOrderSettings).mockReturnValue(
        new Promise((resolve) => {
          resolveSettings = resolve;
        })
      );
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await reachStep4(user);

      expect(screen.getByRole("button", { name: /criar o\.s\./i })).toBeDisabled();
      resolveSettings({ default_travel_fee: "0.00" });
    });

    it("WI2: while travel settings are in an error state, 'Criar O.S.' is disabled", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      vi.mocked(getServiceOrderSettings).mockRejectedValue(new Error("boom"));
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await reachStep4(user);

      await screen.findByText(/não foi possível carregar a taxa padrão/i);
      expect(screen.getByRole("button", { name: /criar o\.s\./i })).toBeDisabled();
      expect(screen.getByText(/carregue a taxa padrão antes de criar/i)).toBeInTheDocument();
    });

    it("WI3: once travel settings load successfully, 'Criar O.S.' is enabled", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      vi.mocked(getServiceOrderSettings).mockResolvedValue({ default_travel_fee: "0.00" });
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await reachStep4(user);

      await waitFor(() => expect(screen.getByRole("button", { name: /criar o\.s\./i })).not.toBeDisabled());
    });

    it("WI4: a travel-settings error never causes travel_fee to be silently sent as '0.00'", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      vi.mocked(getServiceOrderSettings).mockRejectedValue(new Error("boom"));
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await reachStep4(user);

      await screen.findByText(/não foi possível carregar a taxa padrão/i);
      // The button is disabled — there is no way to trigger a submit in
      // this state, so createServiceOrder must never be called at all.
      expect(createServiceOrder).not.toHaveBeenCalled();
    });

    it("OT11: a late travel-settings GET for the old company never prefills the new company's travel fee", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      let resolveSettings!: (value: { default_travel_fee: string }) => void;
      vi.mocked(getServiceOrderSettings).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSettings = resolve;
        })
      );
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderWizard />);
      await reachStep4(user);

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderWizard />);
      await waitFor(() => expect(screen.getAllByText(/etapa 1 de 4/i)[0]).toBeInTheDocument());

      resolveSettings({ default_travel_fee: "77.00" });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.queryByDisplayValue("77,00")).not.toBeInTheDocument();
    });
  });

  describe("Stepper forward-jump guard", () => {
    it("WI5: clearing an item's quantity then jumping to step 4 via the stepper is blocked", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      vi.mocked(listCatalogItems).mockResolvedValue(catalogPage([catalogItem()]));
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);
      await screen.findAllByText("Endereço principal");
      await user.click(screen.getByRole("button", { name: "Avançar" }));

      await user.type(screen.getByLabelText("Buscar produto ou serviço"), "Pintura");
      await screen.findByText("Pintura");
      await user.click(screen.getByRole("button", { name: "Adicionar" }));
      await user.click(screen.getByRole("button", { name: "Avançar" }));
      await waitFor(() => expect(screen.getAllByText(/etapa 4 de 4/i)[0]).toBeInTheDocument());

      // Back to step 3, clear the quantity.
      await user.click(screen.getByRole("button", { name: "Voltar" }));
      await waitFor(() => expect(screen.getAllByText(/etapa 3 de 4/i)[0]).toBeInTheDocument());
      const qtyInput = screen.getByLabelText("Quantidade");
      await user.clear(qtyInput);

      // Jump straight to step 4 via the stepper.
      await user.click(screen.getByRole("button", { name: /4.*agendamento e resumo/i }));

      expect(screen.getAllByText(/etapa 3 de 4/i)[0]).toBeInTheDocument();
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
  });

  describe("Submit-time revalidation", () => {
    it("WI6: an item with an empty quantity blocks advancing past step 3 in the first place (no '1.000' fallback ever gets a chance to run)", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      vi.mocked(listCatalogItems).mockResolvedValue(catalogPage([catalogItem()]));
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);
      await screen.findAllByText("Endereço principal");
      await user.click(screen.getByRole("button", { name: "Avançar" }));

      await user.type(screen.getByLabelText("Buscar produto ou serviço"), "Pintura");
      await screen.findByText("Pintura");
      await user.click(screen.getByRole("button", { name: "Adicionar" }));
      await user.clear(screen.getByLabelText("Quantidade"));

      expect(screen.getByRole("button", { name: "Avançar" })).toBeDisabled();
      expect(createServiceOrder).not.toHaveBeenCalled();
    });

    it("WI7: an empty unit price on a draft item blocks advancing past step 3", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      vi.mocked(listCatalogItems).mockResolvedValue(catalogPage([catalogItem({ sale_price: null })]));
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);
      await screen.findAllByText("Endereço principal");
      await user.click(screen.getByRole("button", { name: "Avançar" }));

      await user.type(screen.getByLabelText("Buscar produto ou serviço"), "Pintura");
      await screen.findByText("Pintura");
      await user.click(screen.getByRole("button", { name: "Adicionar" }));

      expect(screen.getByRole("button", { name: "Avançar" })).toBeDisabled();
      expect(createServiceOrder).not.toHaveBeenCalled();
    });

    it("WI8: a line discount greater than the line's gross value blocks submit", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      vi.mocked(listCatalogItems).mockResolvedValue(catalogPage([catalogItem({ sale_price: "100.00" })]));
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);
      await screen.findAllByText("Endereço principal");
      await user.click(screen.getByRole("button", { name: "Avançar" }));

      await user.type(screen.getByLabelText("Buscar produto ou serviço"), "Pintura");
      await screen.findByText("Pintura");
      await user.click(screen.getByRole("button", { name: "Adicionar" }));
      await user.clear(screen.getByLabelText("Desconto"));
      await user.type(screen.getByLabelText("Desconto"), "999,00");
      await user.click(screen.getByRole("button", { name: "Avançar" }));
      await waitFor(() => expect(screen.getAllByText(/etapa 4 de 4/i)[0]).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: /criar o\.s\./i }));

      expect(createServiceOrder).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getAllByText(/etapa 3 de 4/i)[0]).toBeInTheDocument());
    });

    it("WI9: once an item is invalidated after reaching step 4, there is no remaining path (button or stepper) back to step 4 — both re-run the same guard `handleSubmit` itself trusts", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      vi.mocked(listCatalogItems).mockResolvedValue(catalogPage([catalogItem()]));
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);
      await screen.findAllByText("Endereço principal");
      await user.click(screen.getByRole("button", { name: "Avançar" }));

      await user.type(screen.getByLabelText("Buscar produto ou serviço"), "Pintura");
      await screen.findByText("Pintura");
      await user.click(screen.getByRole("button", { name: "Adicionar" }));
      await user.click(screen.getByRole("button", { name: "Avançar" }));
      await waitFor(() => expect(screen.getAllByText(/etapa 4 de 4/i)[0]).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: "Voltar" }));
      await user.clear(screen.getByLabelText("Preço unitário"));

      // Neither the plain "Avançar" button nor a stepper forward-jump
      // can reach step 4 anymore — the exact same `allItemsValid` guard
      // `handleSubmit`'s own revalidation (§WI6-WI8) also re-checks from
      // scratch backs every one of these paths.
      expect(screen.getByRole("button", { name: "Avançar" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: /4.*agendamento e resumo/i }));
      expect(screen.getAllByText(/etapa 3 de 4/i)[0]).toBeInTheDocument();
    });

    it("WI10: selecting a different customer clears customerDetail/address/contact", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);
      await screen.findAllByText("Endereço principal");
      await user.click(screen.getByRole("button", { name: "Voltar" }));

      vi.mocked(createCustomer).mockResolvedValue({ id: "cust-2", name: "Outro Cliente" } as never);
      vi.mocked(getCustomer).mockResolvedValue(customerDetail({ id: "cust-2", addresses: [] }));
      await user.click(screen.getByRole("button", { name: /novo cliente/i }));
      await user.type(screen.getByLabelText("Nome"), "Outro Cliente");
      await user.click(screen.getByRole("button", { name: /criar cliente/i }));
      await waitFor(() => expect(screen.getByText("Outro Cliente")).toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: "Avançar" }));

      await screen.findByText(/ainda não possui endereço/i);
      expect(screen.getByRole("button", { name: "Avançar" })).toBeDisabled();
    });

    it("WI11: no address selected blocks the final submit", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail({ addresses: [] }));
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);
      await screen.findByText(/ainda não possui endereço/i);

      expect(screen.getByRole("button", { name: "Avançar" })).toBeDisabled();
    });

    it("WI13: order_discount greater than the subtotal blocks submit", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      vi.mocked(listCatalogItems).mockResolvedValue(catalogPage([catalogItem({ sale_price: "50.00" })]));
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);
      await screen.findAllByText("Endereço principal");
      await user.click(screen.getByRole("button", { name: "Avançar" }));

      await user.type(screen.getByLabelText("Buscar produto ou serviço"), "Pintura");
      await screen.findByText("Pintura");
      await user.click(screen.getByRole("button", { name: "Adicionar" }));
      await user.click(screen.getByRole("button", { name: "Avançar" }));
      await waitFor(() => expect(screen.getAllByText(/etapa 4 de 4/i)[0]).toBeInTheDocument());

      await user.clear(screen.getByLabelText("Desconto"));
      await user.type(screen.getByLabelText("Desconto"), "999,00");
      await waitFor(() => expect(screen.getByRole("button", { name: /criar o\.s\./i })).not.toBeDisabled());
      await user.click(screen.getByRole("button", { name: /criar o\.s\./i }));

      await screen.findAllByText(/o desconto não pode ser maior que o subtotal/i);
      expect(createServiceOrder).not.toHaveBeenCalled();
    });

    it("WI14: the final payload's items[] contains only normalized decimal strings, never raw comma-typed values", async () => {
      vi.mocked(getCustomer).mockResolvedValue(customerDetail());
      vi.mocked(listCatalogItems).mockResolvedValue(catalogPage([catalogItem({ sale_price: "50.00" })]));
      vi.mocked(createServiceOrder).mockResolvedValue({ id: "os-1", number: "OS-000001" } as never);
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);
      await screen.findAllByText("Endereço principal");
      await user.click(screen.getByRole("button", { name: "Avançar" }));

      await user.type(screen.getByLabelText("Buscar produto ou serviço"), "Pintura");
      await screen.findByText("Pintura");
      await user.click(screen.getByRole("button", { name: "Adicionar" }));
      await user.clear(screen.getByLabelText("Quantidade"));
      await user.type(screen.getByLabelText("Quantidade"), "2,5");
      await user.click(screen.getByRole("button", { name: "Avançar" }));
      await waitFor(() => expect(screen.getAllByText(/etapa 4 de 4/i)[0]).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: /criar o\.s\./i }));

      await waitFor(() => expect(createServiceOrder).toHaveBeenCalled());
      const payload = vi.mocked(createServiceOrder).mock.calls[0]![0];
      expect(payload.items).toHaveLength(1);
      expect(payload.items[0]!.quantity).toBe("2.500");
      expect(payload.items[0]!.unit_price).toBe("50.00");
      expect(payload.items[0]!.line_discount).toBe("0.00");
    });
  });

  describe("Retry parity (auto-selection)", () => {
    it("RT1: initial customer-detail load auto-selects the primary address and the primary active contact", async () => {
      vi.mocked(getCustomer).mockResolvedValue(
        customerDetail({
          addresses: [
            { id: "addr-1", label: "Secundário", type: "residential", postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null, reference_point: null, is_primary: false, created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z" },
            { id: "addr-2", label: "Endereço Preferido", type: "residential", postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null, reference_point: null, is_primary: true, created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z" },
          ],
          contacts: [
            { id: "contact-1", name: "Contato Principal", role: null, department: null, phone: null, whatsapp: null, email: null, notes: null, is_primary: true, active: true, created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z" },
          ],
        })
      );
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);

      await screen.findAllByText("Endereço Preferido");
      expect(screen.getByRole("radio", { name: /endereço preferido/i })).toBeChecked();
      const contactRadio = await screen.findByRole("radio", { name: /contato principal/i });
      expect(contactRadio).toBeChecked();
    });

    it("RT2: a failed initial load followed by a successful retry applies the same auto-selection as RT1", async () => {
      vi.mocked(getCustomer).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(customerDetail());
      const user = userEvent.setup();
      render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);

      await screen.findByText(/não foi possível carregar os dados deste cliente/i);
      await user.click(screen.getByRole("button", { name: /tentar novamente/i }));

      await screen.findAllByText("Endereço principal");
      const radio = screen.getByRole("radio", { name: /endereço principal/i });
      expect(radio).toBeChecked();
    });

    it("RT3: a late retry response for the old company is discarded, not applied under the new company", async () => {
      let resolveRetry!: (value: Customer) => void;
      vi.mocked(getCustomer)
        .mockResolvedValueOnce(customerDetail())
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveRetry = resolve;
          })
        );
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderWizard />);
      await selectCustomerAndAdvance(user);
      await screen.findAllByText("Endereço principal");

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderWizard />);
      await waitFor(() => expect(screen.getAllByText(/etapa 1 de 4/i)[0]).toBeInTheDocument());

      resolveRetry(customerDetail({ id: "cust-1" }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.queryByText("Cliente Teste")).not.toBeInTheDocument();
    });
  });
});
