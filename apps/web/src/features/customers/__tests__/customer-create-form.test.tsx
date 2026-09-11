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

  /** UXC1/UXC2/UXC3: opens with exactly one address draft, already primary, fields visible without clicking "+". */
  it("UXC1/UXC2/UXC3: starts with one primary address draft, fields visible immediately", () => {
    render(<CustomerCreateForm />);

    expect(screen.getByText("Endereço principal")).toBeInTheDocument();
    expect(screen.getByLabelText("Identificação do endereço")).toHaveValue("Endereço principal");
    // The full field set (CEP, street, city, ...) is already on screen — no "Adicionar" click needed.
    expect(screen.getByLabelText("CEP (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Cidade")).toBeInTheDocument();
    // "Outros endereços" has no drafts yet.
    expect(screen.queryByRole("button", { name: /Tornar principal/ })).not.toBeInTheDocument();
  });

  /** UXC10/UXC12: Contatos starts empty; there is no "Ativo" switch anywhere in the create form. */
  it("UXC10/UXC12: contacts start empty and no 'Ativo' switch exists", () => {
    render(<CustomerCreateForm />);

    expect(screen.queryByLabelText(/Cargo/)).not.toBeInTheDocument();
    expect(screen.queryByText("Ativo")).not.toBeInTheDocument();
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
   * UXC6/UXC7/N5/N6/N7 + phone roundtrip (UXC8/UXC9): CNPJ lookup fills
   * the EXISTING primary address draft (never creates a second one),
   * never overwrites a manually-typed name/phone/email, and the E.164
   * phone from the lookup never shows the country code as if it were a
   * DDD.
   */
  it("UXC6-UXC9/N5-N7: CNPJ lookup fills the existing primary address without corrupting the E.164 phone", async () => {
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

    // §I/§J bug regression: must show a correct BR display, never "(55) 11238-5193".
    const phoneInput = screen.getByLabelText(/Telefone geral/) as HTMLInputElement;
    expect(phoneInput.value).toBe("(11) 2385-1939");
    expect(phoneInput.value.startsWith("(55)")).toBe(false);

    // UXC6: still exactly ONE address draft — the primary itself was filled.
    expect(screen.getAllByLabelText("Identificação do endereço")).toHaveLength(1);
    expect(screen.getByLabelText("Cidade")).toHaveValue("São Paulo");

    // A second lookup click must not create a second address draft either.
    await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));
    await waitFor(() => expect(lookupCnpj).toHaveBeenCalledTimes(2));
    expect(screen.getAllByLabelText("Identificação do endereço")).toHaveLength(1);

    // UXC9: roundtrip — submit must send back the exact original E.164.
    await user.click(screen.getByRole("button", { name: "Criar cliente" }));
    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createCustomer).mock.calls[0]![0];
    expect(payload.phone).toBe("+551123851939");
    expect(payload.addresses).toHaveLength(1);
    expect(payload.addresses![0]!.is_primary).toBe(true);
  });

  /** UXC7: CNPJ lookup preserves an address field already typed manually into the primary draft. */
  it("UXC7: CNPJ lookup preserves manually-typed primary address fields", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue({
      document: "19131243000197",
      legal_name: "Empresa Exemplo",
      trade_name: null,
      phone: null,
      email: null,
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
    await user.type(screen.getByLabelText("Cidade"), "Belo Horizonte");
    await user.type(screen.getByLabelText(/^CNPJ/), "19131243000197");
    await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));

    await waitFor(() => expect(screen.getByLabelText("Logradouro")).toHaveValue("Avenida Paulista"));
    // City was already typed — the lookup must not overwrite it.
    expect(screen.getByLabelText("Cidade")).toHaveValue("Belo Horizonte");
  });

  /** phone roundtrip: mobile E.164 (+5511999999999) displays and resubmits exactly. */
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

  /** CEP lookup on the primary address fills empty fields, fills complement only when empty, never touches number/reference. */
  it("CEP lookup on the primary address fills the correct fields without touching complement/number/reference already set", async () => {
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

    await user.type(screen.getByLabelText("Número"), "42");
    await user.type(screen.getByLabelText("Complemento (opcional)"), "Sala 2");
    await user.type(screen.getByLabelText("Ponto de referência (opcional)"), "Perto do metrô");
    await user.type(screen.getByLabelText("CEP (opcional)"), "01001000");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    await waitFor(() => expect(screen.getByLabelText("Cidade")).toHaveValue("São Paulo"));
    expect(screen.getByLabelText("Bairro")).toHaveValue("Sé");
    expect(screen.getByLabelText("Complemento (opcional)")).toHaveValue("Sala 2");
    expect(screen.getByLabelText("Número")).toHaveValue("42");
    expect(screen.getByLabelText("Ponto de referência (opcional)")).toHaveValue("Perto do metrô");
  });

  /** D/UXC4/UXC5: "Adicionar endereço" creates a non-primary draft under "Outros endereços"; exactly one primary at all times. */
  it("UXC4/UXC5: additional addresses stay non-primary; switching primary keeps exactly one", async () => {
    const user = userEvent.setup();
    render(<CustomerCreateForm />);

    await user.click(screen.getByRole("button", { name: "Adicionar endereço" }));

    expect(screen.getByText("Endereço principal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tornar principal" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tornar principal" }));

    // After the switch, exactly one "Tornar principal" button remains (now offered by the demoted original primary).
    expect(screen.getAllByRole("button", { name: "Tornar principal" })).toHaveLength(1);
  });

  /** N17-N19: multiple contacts, exactly one primary, independent phone/WhatsApp. */
  it("N17-N19/UXC13: contacts get exactly one primary (the first) and independent phone/WhatsApp", async () => {
    const user = userEvent.setup();
    render(<CustomerCreateForm />);

    await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
    expect(screen.getByText("Principal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
    expect(screen.getAllByRole("button", { name: "Tornar principal" })).toHaveLength(1);

    const phoneInputs = screen.getAllByLabelText("Telefone (opcional)");
    const whatsappInputs = screen.getAllByLabelText("WhatsApp (opcional)");
    await user.type(phoneInputs[0]!, "31988880001");
    await user.type(whatsappInputs[0]!, "31988880002");

    expect(phoneInputs[0]).toHaveValue("(31) 98888-0001");
    expect(whatsappInputs[0]).toHaveValue("(31) 98888-0002");
  });

  /** UXC11/UXC14/N20: submit sends one atomic POST; every contact created here is active=true even with no UI toggle. */
  it("UXC11/UXC14/N20: submit sends a single atomic POST with active contacts and no id/company_id", async () => {
    const user = userEvent.setup();
    render(<CustomerCreateForm />);

    await user.type(screen.getAllByLabelText("Nome")[0]!, "Maria Cliente");
    await user.clear(screen.getByLabelText("Identificação do endereço"));
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
    expect(payload.contacts![0]!.active).toBe(true);
    expect(payload).not.toHaveProperty("id");
    expect(push).toHaveBeenCalledWith("/clientes/new-id");
  });
});
