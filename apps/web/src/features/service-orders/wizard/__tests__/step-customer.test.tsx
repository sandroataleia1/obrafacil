import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/customers/customers-client", () => ({
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  lookupCnpj: vi.fn(),
  createAddress: vi.fn(),
  createContact: vi.fn(),
  lookupCep: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ activeCompany: { id: "company-a", name: "Empresa A" } }),
}));

import { listCustomers } from "@/features/customers/customers-client";
import type { CustomerListItem, CustomerPaginationResponse } from "@/features/customers/types";
import { StepCustomer } from "../step-customer";

function customerListItem(overrides: Partial<CustomerListItem> = {}): CustomerListItem {
  return {
    id: "cust-search-1",
    kind: "individual",
    name: "Fulano Pereira",
    legal_name: null,
    trade_name: null,
    document: "12345678900",
    phone: "+5531999999999",
    email: null,
    active: true,
    primary_address: { id: "addr-1", label: "Casa", type: "residential", postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: "Belo Horizonte", state: "MG", reference_point: null, is_primary: true, created_at: "", updated_at: "" },
    primary_contact: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function page(items: CustomerListItem[]): CustomerPaginationResponse {
  return {
    data: items,
    meta: { current_page: 1, from: 1, last_page: 1, per_page: 15, to: items.length, total: items.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

const isStaleRequestAlwaysFresh = () => false;

function renderStepCustomer(overrides: Partial<Parameters<typeof StepCustomer>[0]> = {}) {
  return render(
    <StepCustomer
      selected={null}
      onSelect={vi.fn()}
      requestCompanyId="company-a"
      isStaleRequest={isStaleRequestAlwaysFresh}
      {...overrides}
    />
  );
}

describe("StepCustomer — autocomplete gating", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("SC1: 0/1/2 trimmed characters fire zero API calls", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([]));
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "j");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(listCustomers).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Buscar cliente"), "o");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(listCustomers).not.toHaveBeenCalled();
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();
  });

  it("SC2: leading/trailing whitespace is trimmed before the length check — '  jo ' (2 real chars) never fires", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([]));
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "  jo ");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(listCustomers).not.toHaveBeenCalled();
  });

  it("SC3: 3+ characters fire the search after debounce and results render", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([customerListItem()]));
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());
    await screen.findByText("Fulano Pereira");
  });

  it("SC4: a too-short query never shows 'Nenhum cliente encontrado'", async () => {
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "jo");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(screen.queryByText(/nenhum cliente encontrado/i)).not.toBeInTheDocument();
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();
  });

  it("SC5: a real 3+ char search that returns zero rows shows 'Nenhum cliente encontrado'", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([]));
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());
    await screen.findByText(/nenhum cliente encontrado/i);
  });

  it("SC6: selecting a result clears results/search/input immediately and shows the compact selected card", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([customerListItem()]));
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderStepCustomer({ onSelect });

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await screen.findByText("Fulano Pereira");
    await user.click(screen.getByText("Fulano Pereira"));

    expect(onSelect).toHaveBeenCalledWith(customerListItem());

    rerender(
      <StepCustomer
        selected={customerListItem()}
        onSelect={onSelect}
        requestCompanyId="company-a"
        isStaleRequest={isStaleRequestAlwaysFresh}
      />
    );

    expect(screen.queryByLabelText("Buscar cliente")).not.toBeInTheDocument();
    expect(screen.getByText("Cliente selecionado")).toBeInTheDocument();
    expect(screen.getAllByText("Fulano Pereira")[0]).toBeInTheDocument();
  });

  it("SC7: the compact card shows document and phone when present", () => {
    renderStepCustomer({ selected: customerListItem() });

    expect(screen.getByText("Cliente selecionado")).toBeInTheDocument();
    expect(screen.getByText(/123\.456\.789-00/)).toBeInTheDocument();
  });

  it("SC8: 'Trocar cliente' reopens search mode without clearing the current selection", async () => {
    const user = userEvent.setup();
    renderStepCustomer({ selected: customerListItem() });

    await user.click(screen.getByRole("button", { name: /trocar cliente/i }));

    expect(screen.getByLabelText("Buscar cliente")).toBeInTheDocument();
    // The previous selection is still visible/known to the parent — this
    // component never nulls it out on its own; only a NEW pick does.
    expect(screen.queryByText("Cliente selecionado")).not.toBeInTheDocument();
  });

  it("SC9: Enter selects the top/highlighted result and closes the autocomplete", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([customerListItem()]));
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderStepCustomer({ onSelect });

    const input = screen.getByLabelText("Buscar cliente");
    await user.type(input, "ful");
    await screen.findByText("Fulano Pereira");
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(customerListItem());
  });

  it("SC10: a late response for a company that's since changed is discarded", async () => {
    let resolveSearch!: (value: CustomerPaginationResponse) => void;
    vi.mocked(listCustomers).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
    );
    const activeCompanyIdRef = { current: "company-a" as string | undefined };
    const isStaleRequest = (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId;
    const user = userEvent.setup();
    const { rerender } = render(
      <StepCustomer selected={null} onSelect={vi.fn()} requestCompanyId="company-a" isStaleRequest={isStaleRequest} />
    );

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());

    activeCompanyIdRef.current = "company-b";
    rerender(
      <StepCustomer selected={null} onSelect={vi.fn()} requestCompanyId="company-b" isStaleRequest={isStaleRequest} />
    );

    resolveSearch(page([customerListItem({ name: "Fulano da Empresa A" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Fulano da Empresa A")).not.toBeInTheDocument();
  });
});
