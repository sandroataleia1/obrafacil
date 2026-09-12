import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `StepCustomer`/`StepLocation` render the wizard's quick-create dialogs
// via `ResponsiveDialog`, which reads `window.matchMedia`.
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
  getCustomer: vi.fn(),
  createCustomer: vi.fn(),
  createAddress: vi.fn(),
  createContact: vi.fn(),
  listCustomers: vi.fn(),
  lookupCnpj: vi.fn(),
  lookupCep: vi.fn(),
}));

vi.mock("../service-orders-client", () => ({
  getServiceOrder: vi.fn(),
  updateServiceOrder: vi.fn(),
}));

import { getCustomer, listCustomers } from "@/features/customers/customers-client";
import type { Customer } from "@/features/customers/types";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { getServiceOrder, updateServiceOrder } from "../service-orders-client";
import { ServiceOrderEdit } from "../service-order-edit";
import type { ServiceOrder } from "../types";

function order(overrides: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id: "os-1",
    number: "OS-000001",
    status: "open",
    title: "Reparo elétrico",
    customer_id: "cust-1",
    customer_address_id: "addr-1",
    customer_contact_id: null,
    responsible_user_id: null,
    description: null,
    customer: { name: "Cliente Teste", document: "12345678900", phone: null, email: null },
    execution_address: {
      label: "Endereço Centro",
      type: "work_site",
      postal_code: null,
      street: null,
      number: null,
      complement: null,
      neighborhood: null,
      city: null,
      state: null,
      reference_point: null,
    },
    contact: null,
    scheduled_start_at: null,
    scheduled_end_at: null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    notes: null,
    subtotal: "100.00",
    order_discount: "0.00",
    travel_fee: "0.00",
    total: "100.00",
    items: [],
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    kind: "individual",
    name: "Cliente Teste",
    legal_name: null,
    trade_name: null,
    document: "12345678900",
    phone: null,
    email: null,
    notes: null,
    active: true,
    addresses: [
      {
        id: "addr-1",
        label: "Endereço Centro",
        type: "work_site",
        postal_code: null,
        street: null,
        number: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
        reference_point: null,
        is_primary: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    contacts: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const emptyCustomerPage = {
  data: [],
  meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 },
  links: { first: null, last: null, prev: null, next: null },
};

describe("ServiceOrderEdit", () => {
  beforeEach(() => {
    vi.mocked(getServiceOrder).mockReset();
    vi.mocked(updateServiceOrder).mockReset();
    vi.mocked(getCustomer).mockReset();
    vi.mocked(listCustomers).mockReset().mockResolvedValue(emptyCustomerPage);
    push.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("EH1: loads the order and shows the current customer immediately from the snapshot", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order());
    vi.mocked(getCustomer).mockResolvedValue(customer());
    render(<ServiceOrderEdit id="os-1" />);
    await screen.findByText(/cliente atual: cliente teste/i);
  });

  it("EH2: fetches the customer's live detail and auto-selects the original address when it still exists", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order());
    vi.mocked(getCustomer).mockResolvedValue(customer());
    render(<ServiceOrderEdit id="os-1" />);
    await waitFor(() => expect(getCustomer).toHaveBeenCalledWith("cust-1"));
    const radio = await screen.findByRole("radio", { name: /endereço centro/i });
    await waitFor(() => expect(radio).toBeChecked());
  });

  it("EH3: when the original address no longer exists on the customer, shows a blocking warning and does not preselect", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ customer_address_id: "addr-deleted" }));
    vi.mocked(getCustomer).mockResolvedValue(customer());
    render(<ServiceOrderEdit id="os-1" />);
    await screen.findByText(/não está mais disponível no cadastro/i);
    const radio = await screen.findByRole("radio", { name: /endereço centro/i });
    expect(radio).not.toBeChecked();
  });

  it("EH4: when the original contact no longer resolves, silently falls back to 'Sem contato' with no warning", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ customer_contact_id: "contact-deleted" }));
    vi.mocked(getCustomer).mockResolvedValue(customer());
    render(<ServiceOrderEdit id="os-1" />);
    const noneRadio = await screen.findByRole("radio", { name: /sem contato/i });
    await waitFor(() => expect(noneRadio).toBeChecked());
    expect(screen.queryByText(/não está mais disponível/i)).not.toBeInTheDocument();
  });

  it("EH5: picking a different customer clears the address/contact selection and auto-selects the new customer's primary address", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order());
    vi.mocked(getCustomer).mockResolvedValueOnce(customer()).mockResolvedValueOnce(
      customer({
        id: "cust-2",
        name: "Outro Cliente",
        addresses: [
          {
            id: "addr-2",
            label: "Outro endereço",
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
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      })
    );
    vi.mocked(listCustomers).mockResolvedValue({
      ...emptyCustomerPage,
      data: [
        {
          id: "cust-2",
          kind: "individual",
          name: "Outro Cliente",
          legal_name: null,
          trade_name: null,
          document: null,
          phone: null,
          email: null,
          active: true,
          primary_address: null,
          primary_contact: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const user = userEvent.setup();
    render(<ServiceOrderEdit id="os-1" />);
    await screen.findByRole("radio", { name: /endereço centro/i });

    await user.type(screen.getByLabelText(/buscar cliente/i), "Outro");
    await screen.findByText("Outro Cliente");
    await user.click(screen.getByText("Outro Cliente"));

    await screen.findByRole("radio", { name: /outro endereço/i });
    await waitFor(() => expect(screen.getByRole("radio", { name: /outro endereço/i })).toBeChecked());
  });

  it("EH6: the PUT payload contains exactly the required fields, preserves responsible_user_id unchanged, and omits every hostile field", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ responsible_user_id: "user-42" }));
    vi.mocked(getCustomer).mockResolvedValue(customer());
    vi.mocked(updateServiceOrder).mockResolvedValue(order({ responsible_user_id: "user-42" }));
    const user = userEvent.setup();
    render(<ServiceOrderEdit id="os-1" />);
    await screen.findByRole("radio", { name: /endereço centro/i });
    await waitFor(() => expect(screen.getByRole("radio", { name: /endereço centro/i })).toBeChecked());

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(updateServiceOrder).toHaveBeenCalled());
    const [orderId, payload] = vi.mocked(updateServiceOrder).mock.calls[0]!;
    expect(orderId).toBe("os-1");
    expect(payload).toEqual({
      customer_id: "cust-1",
      customer_address_id: "addr-1",
      customer_contact_id: null,
      responsible_user_id: "user-42",
      title: "Reparo elétrico",
      description: null,
      scheduled_start_at: null,
      scheduled_end_at: null,
      order_discount: "0.00",
      travel_fee: "0.00",
      notes: null,
    });
    for (const hostileField of ["status", "number", "company_id", "project_id", "subtotal", "total", "items", "created_at", "updated_at"]) {
      expect(payload).not.toHaveProperty(hostileField);
    }
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ordens-servico/os-1"));
  });

  it("EH7: ISO scheduled_start_at prefills the datetime-local input and, unchanged, round-trips back to the exact same instant", async () => {
    const iso = "2026-09-10T13:00:00.000000Z";
    vi.mocked(getServiceOrder).mockResolvedValue(order({ scheduled_start_at: iso }));
    vi.mocked(getCustomer).mockResolvedValue(customer());
    vi.mocked(updateServiceOrder).mockResolvedValue(order({ scheduled_start_at: iso }));
    const user = userEvent.setup();
    render(<ServiceOrderEdit id="os-1" />);
    const startInput = await screen.findByLabelText(/início previsto/i);
    await waitFor(() => expect((startInput as HTMLInputElement).value).not.toBe(""));

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));
    await waitFor(() => expect(updateServiceOrder).toHaveBeenCalled());
    const [, payload] = vi.mocked(updateServiceOrder).mock.calls[0]!;
    expect(new Date((payload as { scheduled_start_at: string }).scheduled_start_at).getTime()).toBe(new Date(iso).getTime());
  });

  it("EH8: money fields prefill from decimal strings and convert back to decimal strings on save", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ travel_fee: "45.50", order_discount: "10.00", subtotal: "100.00" }));
    vi.mocked(getCustomer).mockResolvedValue(customer());
    vi.mocked(updateServiceOrder).mockResolvedValue(order());
    const user = userEvent.setup();
    render(<ServiceOrderEdit id="os-1" />);
    const travelFeeInput = await screen.findByLabelText(/deslocamento/i);
    expect((travelFeeInput as HTMLInputElement).value).toBe("45,50");

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));
    await waitFor(() => expect(updateServiceOrder).toHaveBeenCalled());
    const [, payload] = vi.mocked(updateServiceOrder).mock.calls[0]!;
    expect((payload as { travel_fee: string }).travel_fee).toBe("45.50");
    expect((payload as { order_discount: string }).order_discount).toBe("10.00");
  });

  it("EH9: a 422 with field errors maps to the right section, never a bare generic message", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order());
    vi.mocked(getCustomer).mockResolvedValue(customer());
    vi.mocked(updateServiceOrder).mockRejectedValue(
      new ApiValidationError({ title: ["O campo título é obrigatório."] })
    );
    const user = userEvent.setup();
    render(<ServiceOrderEdit id="os-1" />);
    await screen.findByRole("radio", { name: /endereço centro/i });

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.getAllByText("O campo título é obrigatório.").length).toBeGreaterThan(0));
  });

  it("EH10: a 409 on save re-GETs the order and renders the readonly block once it is now terminal", async () => {
    vi.mocked(getServiceOrder)
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(order({ status: "completed", completed_at: "2026-09-10T12:00:00Z" }));
    vi.mocked(getCustomer).mockResolvedValue(customer());
    vi.mocked(updateServiceOrder).mockRejectedValue(new ApiError(409, "Conflict"));
    const user = userEvent.setup();
    render(<ServiceOrderEdit id="os-1" />);
    await screen.findByRole("radio", { name: /endereço centro/i });

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await screen.findByText(/está concluída e não pode mais ser editada/i);
    expect(screen.queryByRole("button", { name: /salvar alterações/i })).not.toBeInTheDocument();
    expect(updateServiceOrder).toHaveBeenCalledTimes(1);
  });

  it("EH11: direct navigation into /editar for an already-terminal order renders only the readonly block, never the form", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "cancelled", cancelled_at: "2026-09-10T12:00:00Z" }));
    render(<ServiceOrderEdit id="os-1" />);
    await screen.findByText(/está cancelada e não pode mais ser editada/i);
    expect(screen.queryByRole("button", { name: /salvar alterações/i })).not.toBeInTheDocument();
    expect(getCustomer).not.toHaveBeenCalled();
  });

  it("EH12: order_discount is validated against the server-loaded subtotal, not a locally recomputed one", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ subtotal: "50.00" }));
    vi.mocked(getCustomer).mockResolvedValue(customer());
    const user = userEvent.setup();
    render(<ServiceOrderEdit id="os-1" />);
    const discountInput = await screen.findByLabelText(/desconto/i);
    await user.clear(discountInput);
    await user.type(discountInput, "999,00");

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.getAllByText(/desconto não pode ser maior que o subtotal/i).length).toBeGreaterThan(0));
    expect(updateServiceOrder).not.toHaveBeenCalled();
  });

  describe("Tenant safety", () => {
    it("ET1: fail-closed — a company switch mid-load hides Company A's data before Company B's response arrives", async () => {
      let resolveB!: (value: ServiceOrder) => void;
      const bPromise = new Promise<ServiceOrder>((resolve) => {
        resolveB = resolve;
      });
      vi.mocked(getServiceOrder).mockResolvedValueOnce(order()).mockReturnValueOnce(bPromise);
      vi.mocked(getCustomer).mockResolvedValue(customer());

      const { rerender } = render(<ServiceOrderEdit id="os-1" />);
      await screen.findByText(/cliente atual: cliente teste/i);

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderEdit id="os-1" />);

      expect(screen.queryByText(/cliente atual: cliente teste/i)).not.toBeInTheDocument();
      resolveB(order({ number: "OS-000002" }));
      await screen.findByText(/OS-000002/i);
    });

    it("ET2: cross-tenant access (404) renders as not-found, never a 500 or a leak", async () => {
      vi.mocked(getServiceOrder).mockRejectedValue(new ApiError(404, "Not found"));
      render(<ServiceOrderEdit id="foreign-os" />);
      await screen.findByText("O.S. não encontrada");
    });

    it("ET3: a late header GET for Company A is discarded and never repaints under Company B", async () => {
      let resolveA!: (value: ServiceOrder) => void;
      const aPromise = new Promise<ServiceOrder>((resolve) => {
        resolveA = resolve;
      });
      vi.mocked(getServiceOrder).mockReturnValueOnce(aPromise).mockResolvedValueOnce(order({ number: "OS-000002" }));
      vi.mocked(getCustomer).mockResolvedValue(customer());

      const { rerender } = render(<ServiceOrderEdit id="os-1" />);
      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderEdit id="os-1" />);
      await screen.findByText(/OS-000002/i);

      resolveA(order({ number: "OS-000001" }));
      await waitFor(() => expect(screen.queryByText(/OS-000001/i)).not.toBeInTheDocument());
    });
  });
});
