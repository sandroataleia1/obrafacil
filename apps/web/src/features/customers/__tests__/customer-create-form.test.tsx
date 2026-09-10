import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerCreateForm } from "../customer-create-form";
import type { Customer } from "../types";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../customers-client", () => ({
  createCustomer: vi.fn(),
  lookupCnpj: vi.fn(),
  lookupCep: vi.fn(),
}));

import { createCustomer, lookupCep, lookupCnpj } from "../customers-client";

const CREATED_CUSTOMER: Customer = {
  id: "new-id",
  kind: "individual",
  name: "João",
  legal_name: null,
  trade_name: null,
  document: null,
  phone: null,
  email: null,
  notes: null,
  active: true,
  addresses: [],
  contacts: [],
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

describe("CustomerCreateForm", () => {
  beforeEach(() => {
    vi.mocked(createCustomer).mockReset().mockResolvedValue(CREATED_CUSTOMER);
    vi.mocked(lookupCnpj).mockReset();
    vi.mocked(lookupCep).mockReset();
    push.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** N1/N2: PF is the default; switching to PJ reveals company fields. */
  it("N1/N2: defaults to Pessoa física, switches to Pessoa jurídica", async () => {
    const user = userEvent.setup();
    render(<CustomerCreateForm />);

    expect(screen.getByLabelText(/^CPF/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^CNPJ/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));

    expect(screen.getByLabelText(/^CNPJ/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Razão social/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome fantasia/)).toBeInTheDocument();
  });

  /**
   * N4/N5/N6/N7/N9: CNPJ lookup fills empty fields, never overwrites a
   * manually-typed name/phone/email, and never duplicates the address
   * draft on a repeated lookup.
   *
   * CRITICAL (FRONTEND-CLIENTS-01A blocker): the lookup returns phone in
   * E.164 (+551123851939) — the form must display it as a BR-masked
   * national number, never interpret "55" as a DDD or truncate a digit.
   */
  it("N5/N6/N7/N9 + phone roundtrip: CNPJ lookup fills empty fields without corrupting E.164 phone", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue({
      document: "19131243000197",
      legal_name: "Open Knowledge Brasil",
      trade_name: "OKBR",
      phone: "+551123851939",
      email: "contato@okbr.org.br",
      address: {
        postal_code: "01310000",
        street: "Avenida Paulista",
        number: "1000",
        complement: null,
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
      },
    });

    const user = userEvent.setup();
    render(<CustomerCreateForm />);
    await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));

    await user.type(screen.getByLabelText(/^CNPJ/), "19131243000197");
    // N6: name typed manually before lookup must survive it.
    await user.type(screen.getByLabelText("Nome para identificação"), "Meu Nome Manual");

    await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));

    await waitFor(() => expect(screen.getByLabelText(/Razão social/)).toHaveValue("Open Knowledge Brasil"));
    expect(screen.getByLabelText(/Nome fantasia/)).toHaveValue("OKBR");
    expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Meu Nome Manual");

    // The E.164 bug: must show a correct BR display, never "(55) 11238-5193".
    const phoneInput = screen.getByLabelText(/Telefone geral/) as HTMLInputElement;
    expect(phoneInput.value).toBe("(11) 2385-1939");

    // N8: exactly one address draft created from the lookup's address.
    expect(screen.getAllByLabelText("Identificação do endereço")).toHaveLength(1);
    expect(screen.getByLabelText("Cidade")).toHaveValue("São Paulo");

    // N9: a second lookup click must not create a second address draft.
    await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));
    await waitFor(() => expect(lookupCnpj).toHaveBeenCalledTimes(2));
    expect(screen.getAllByLabelText("Identificação do endereço")).toHaveLength(1);

    // Roundtrip: submit must send back the exact original E.164, no
    // duplicated "+55" and no dropped digit.
    await user.click(screen.getByRole("button", { name: "Criar cliente" }));
    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createCustomer).mock.calls[0]![0];
    expect(payload.phone).toBe("+551123851939");
  });

  /** M4/M5 equivalent for the form's own phone field: a mobile E.164 also roundtrips exactly. */
  it("phone roundtrip: mobile E.164 (+5511999999999) displays and resubmits exactly", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue({
      document: "19131243000197",
      legal_name: "Empresa Exemplo",
      trade_name: null,
      phone: "+5511999999999",
      email: null,
      address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
    });

    const user = userEvent.setup();
    render(<CustomerCreateForm />);
    await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
    await user.type(screen.getByLabelText(/^CNPJ/), "19131243000197");
    await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));

    const phoneInput = screen.getByLabelText(/Telefone geral/) as HTMLInputElement;
    await waitFor(() => expect(phoneInput.value).toBe("(11) 99999-9999"));

    await user.type(screen.getByLabelText("Nome para identificação"), "X");
    await user.click(screen.getByRole("button", { name: "Criar cliente" }));
    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createCustomer).mock.calls[0]![0].phone).toBe("+5511999999999");
  });

  /** N7: a phone already typed manually is never overwritten by the CNPJ lookup. */
  it("N7: CNPJ lookup never overwrites a manually-typed phone", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue({
      document: "19131243000197",
      legal_name: "Empresa Exemplo",
      trade_name: null,
      phone: "+551123851939",
      email: null,
      address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
    });

    const user = userEvent.setup();
    render(<CustomerCreateForm />);
    await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
    await user.type(screen.getByLabelText(/Telefone geral/), "31988887777");
    await user.type(screen.getByLabelText(/^CNPJ/), "19131243000197");
    await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));

    await waitFor(() => expect(lookupCnpj).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText(/Telefone geral/)).toHaveValue("(31) 98888-7777");
  });

  /** N13/N14/N15/N16: CEP lookup fills empty geo fields, fills complement
   * only when empty, and never touches label/number/reference_point. */
  it("N13-N16: CEP lookup fills the correct address without touching complement/number/reference already set", async () => {
    vi.mocked(lookupCep).mockResolvedValue({
      postal_code: "01001000",
      street: "Praça da Sé",
      neighborhood: "Sé",
      city: "São Paulo",
      state: "SP",
      provider_complement: "lado ímpar",
    });

    const user = userEvent.setup();
    render(<CustomerCreateForm />);
    await user.click(screen.getByRole("button", { name: "Adicionar endereço" }));

    await user.type(screen.getByLabelText("Número"), "42");
    await user.type(screen.getByLabelText("Complemento (opcional)"), "Sala 2");
    await user.type(screen.getByLabelText("Ponto de referência (opcional)"), "Perto do metrô");
    await user.type(screen.getByLabelText("CEP (opcional)"), "01001000");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    await waitFor(() => expect(screen.getByLabelText("Cidade")).toHaveValue("São Paulo"));
    expect(screen.getByLabelText("Bairro")).toHaveValue("Sé");
    // Complement was already filled — CEP's provider_complement must not overwrite it.
    expect(screen.getByLabelText("Complemento (opcional)")).toHaveValue("Sala 2");
    // number/reference_point are never touched by a CEP lookup.
    expect(screen.getByLabelText("Número")).toHaveValue("42");
    expect(screen.getByLabelText("Ponto de referência (opcional)")).toHaveValue("Perto do metrô");
  });

  /** N11/N12: multiple addresses, exactly one primary, switching primary works. */
  it("N11/N12: multiple addresses stay with exactly one primary", async () => {
    const user = userEvent.setup();
    render(<CustomerCreateForm />);

    await user.click(screen.getByRole("button", { name: "Adicionar endereço" }));
    await user.click(screen.getByRole("button", { name: "Adicionar endereço" }));

    expect(screen.getByText("Endereço 1")).toBeInTheDocument();
    expect(screen.getByText("Endereço 2")).toBeInTheDocument();
    // Only the second (non-primary) card offers "Definir como principal".
    expect(screen.getAllByRole("button", { name: "Definir como principal" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Definir como principal" }));
    // Now the first card is the one offering to become primary instead.
    expect(screen.getAllByRole("button", { name: "Definir como principal" })).toHaveLength(1);
  });

  /** N17/N18/N19: multiple contacts, exactly one primary, phone/WhatsApp independent. */
  it("N17-N19: multiple contacts stay with exactly one primary and independent phone/WhatsApp", async () => {
    const user = userEvent.setup();
    render(<CustomerCreateForm />);

    await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
    await user.click(screen.getByRole("button", { name: "Adicionar contato" }));

    expect(screen.getAllByRole("button", { name: "Definir como principal" })).toHaveLength(1);

    const phoneInputs = screen.getAllByLabelText("Telefone (opcional)");
    const whatsappInputs = screen.getAllByLabelText("WhatsApp (opcional)");
    await user.type(phoneInputs[0]!, "31988880001");
    await user.type(whatsappInputs[0]!, "31988880002");

    expect(phoneInputs[0]).toHaveValue("(31) 98888-0001");
    expect(whatsappInputs[0]).toHaveValue("(31) 98888-0002");
  });

  /** N20: submit sends exactly one POST with customer + addresses + contacts. */
  it("N20: submit sends a single POST with customer, addresses, and contacts together", async () => {
    const user = userEvent.setup();
    render(<CustomerCreateForm />);

    await user.type(screen.getAllByLabelText("Nome")[0]!, "Maria Cliente");
    await user.click(screen.getByRole("button", { name: "Adicionar endereço" }));
    await user.type(screen.getByLabelText("Identificação do endereço"), "Casa");
    await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
    const nameInputs = screen.getAllByLabelText("Nome");
    await user.type(nameInputs[nameInputs.length - 1]!, "João Contato");

    await user.click(screen.getByRole("button", { name: "Criar cliente" }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createCustomer).mock.calls[0]![0];
    expect(payload.name).toBe("Maria Cliente");
    expect(payload.addresses).toHaveLength(1);
    expect(payload.addresses![0]!.label).toBe("Casa");
    expect(payload.addresses![0]!.is_primary).toBe(true);
    expect(payload.contacts).toHaveLength(1);
    expect(payload.contacts![0]!.name).toBe("João Contato");
    expect(payload).not.toHaveProperty("id");
    expect(push).toHaveBeenCalledWith("/clientes/new-id");
  });
});
